use actix_files::NamedFile;
use actix_web::{
    http::{uri::Scheme, StatusCode, Uri},
    HttpRequest, HttpResponse,
};

pub async fn answer404(req: HttpRequest) -> actix_web::Result<HttpResponse> {
    let file = NamedFile::open_async("./static/404.html").await?;
    let mut res = file.into_response(&req);
    *res.status_mut() = StatusCode::NOT_FOUND;
    Ok(res)
}

pub async fn redirect_to_https(req: HttpRequest) -> actix_web::Result<HttpResponse> {
    // Create the HTTPS URL using the host from the request
    let redirect_url = Uri::from_parts({
        let mut parts = req.uri().clone().into_parts();
        parts.scheme = Some(Scheme::HTTPS);
        parts
    })
    .unwrap_or(Uri::from_static("https://mrandl.fr"));

    let response = HttpResponse::PermanentRedirect()
        .insert_header(("Location", redirect_url.to_string()))
        .finish();

    Ok(response)
}
