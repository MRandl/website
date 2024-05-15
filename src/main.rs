mod common_answers;
mod security;

use actix_files as fs;
use actix_web::{web, App, HttpServer};
use actix_web_lab::middleware::from_fn;
use futures::future;
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};

use common_answers::{answer404, redirect_to_https};
use security::force_hsts;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
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
            // force HSTS tag to appear on all outgoing http responses
            .wrap(from_fn(force_hsts))
            // serve 'static' subfolder on disk, on the root url
            .service(
                fs::Files::new("/", "./static")
                    .index_file("index.html")
                    .prefer_utf8(true)
                    .use_hidden_files()
                    .default_handler(web::to(answer404)),
            )
    })
    .bind_openssl("0.0.0.0:443", tls_factory)?
    .run();

    // Redirect all http (80) traffic to https (443) to make the google hstspreload.org thing happy
    let server_unencrypted =
        HttpServer::new(|| App::new().default_service(web::to(redirect_to_https)))
            .bind("0.0.0.0:80")?
            .workers(1) // it must not impede on the other, so we limit the thread count
            .run();

    future::try_join(server_tls, server_unencrypted).await?;
    Ok(())
}
