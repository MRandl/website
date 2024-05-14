mod security;

use actix_files as fs;
use actix_web::{
    dev::{fn_service, ServiceRequest, ServiceResponse},
    http::StatusCode,
    web, App, HttpServer,
};
use actix_web_lab::middleware::from_fn;
use security::force_hsts;

use fs::NamedFile;
use futures::future;
use openssl::ssl::{SslAcceptor, SslFiletype, SslMethod};

async fn answer404(req: ServiceRequest) -> actix_web::Result<ServiceResponse> {
    let (req, _) = req.into_parts();
    let file = NamedFile::open_async("./static/404.html").await?;
    let mut res = file.into_response(&req);
    *res.status_mut() = StatusCode::NOT_FOUND;
    Ok(ServiceResponse::new(req, res))
}

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
            // force HSTS on all outgoing http responses
            .wrap(from_fn(force_hsts))
            // serve 'static' subfolder on disk, on the root url
            .service(
                fs::Files::new("/", "./static")
                    .index_file("index.html")
                    .prefer_utf8(true)
                    .default_handler(fn_service(answer404)),
            )
    })
    .bind_openssl("0.0.0.0:443", tls_factory)?
    .run();

    // redirect http (port 80) to https (443) because I am a nice person.
    // traffic is not encrypted until redirect is complete.
    let server_insecure =
        HttpServer::new(|| App::new().service(web::redirect("/", "https://mrandl.fr").permanent()))
            .bind("0.0.0.0:80")?
            .run();

    future::try_join(server_tls, server_insecure).await?;

    Ok(())
}
