use actix_files as fs;
use actix_web::{
    dev::{fn_service, Service, ServiceRequest, ServiceResponse},
    http::{
        header::{HeaderValue, STRICT_TRANSPORT_SECURITY},
        StatusCode,
    },
    App, HttpServer,
};
use fs::NamedFile;
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
    let mut builder = SslAcceptor::mozilla_intermediate_v5(SslMethod::tls()).unwrap();
    builder
        .set_private_key_file(
            "/etc/letsencrypt/live/mrandl.fr/privkey.pem",
            SslFiletype::PEM,
        )
        .unwrap();
    builder
        .set_certificate_chain_file("/etc/letsencrypt/live/mrandl.fr/fullchain.pem")
        .unwrap();

    HttpServer::new(|| {
        App::new()
            // force HSTS on all outgoing http responses, tagged client-side for the next two years (=63072000s)
            .wrap_fn(|req, srv| {
                let fut: _ = srv.call(req);
                async {
                    let mut res = fut.await?;
                    let hdrs = res.headers_mut();
                    hdrs.insert(
                        STRICT_TRANSPORT_SECURITY,
                        HeaderValue::from_static("max-age=63072000; includeSubDomains; preload"),
                    );
                    Ok(res)
                }
            })
            // serve 'static' subfolder on disk, on the root url
            .service(
                fs::Files::new("/", "./static")
                    .index_file("index.html")
                    .prefer_utf8(true)
                    .default_handler(fn_service(answer404)),
            )
    })
    .bind_openssl("0.0.0.0:8801", builder)?
    .run()
    .await
}
