mod common_answers;

use actix_files as fs;
use actix_web::{
    guard::GuardContext,
    middleware::{self, Logger},
    web, App, HttpServer,
};
use env_logger::Env;
use futures::future;
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};

use common_answers::{answer404, redirect_to_https, to_balelec};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(Env::new().default_filter_or("info"));

    let mut tls_factory = SslAcceptor::mozilla_intermediate_v5(SslMethod::tls()).unwrap();
    tls_factory
        .set_private_key_file(
            "/etc/letsencrypt/live/mrandl.fr/privkey.pem",
            SslFiletype::PEM,
        )
        .unwrap();
    tls_factory
        .set_certificate_chain_file("/etc/letsencrypt/live/mrandl.fr/fullchain.pem")
        .unwrap();

    let server_tls = HttpServer::new(|| {
        App::new()
            .wrap(Logger::default())
            // force HSTS tag + cache locally on all outgoing http responses
            .wrap(
                middleware::DefaultHeaders::new()
                    .add((
                        actix_web::http::header::CACHE_CONTROL,
                        "max-age=3600, public, stale-while-revalidate=604800",
                    ))
                    .add((
                        actix_web::http::header::STRICT_TRANSPORT_SECURITY,
                        "max-age=63072000; includeSubDomains; preload",
                    )),
            )
            // redirect *.crapulerie.ch to balelec.ch
            .route(
                "/",
                web::to(to_balelec).guard(|s: &GuardContext| match s.head().uri.host() {
                    None => false,
                    Some(s) => s.ends_with("crapulerie.ch"),
                } && s.head().uri.path() == "/"),
            )
            // serve 'static' subfolder from disk, on the root url
            .service(
                fs::Files::new("/", "./static")
                    .index_file("index.html")
                    .prefer_utf8(true)
                    .use_hidden_files() // needed for certbot
                    .default_handler(web::to(answer404)),
            )
    })
    .bind_openssl("[::]:443", tls_factory)?
    .run();

    // Redirect all http (80) traffic to https (443) to make the google hstspreload.org thing happy
    let server_unencrypted =
        HttpServer::new(|| App::new().default_service(web::to(redirect_to_https)))
            .bind("[::]:80")?
            .workers(1) // it must not impede on the other, so we limit the thread count
            .run();

    future::try_join(server_tls, server_unencrypted).await?;
    Ok(())
}
