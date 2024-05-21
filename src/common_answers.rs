use actix_files::NamedFile;
use actix_web::{
    http::{
        uri::{Authority, Parts, Scheme},
        StatusCode, Uri,
    },
    HttpRequest, HttpResponse,
};

pub async fn answer404(req: HttpRequest) -> actix_web::Result<HttpResponse> {
    let file = NamedFile::open_async("./static/404.html").await?;
    let mut res = file.into_response(&req);
    *res.status_mut() = StatusCode::NOT_FOUND;
    Ok(res)
}

pub async fn redirect_to_https(req: HttpRequest) -> actix_web::Result<HttpResponse> {
    let req_host = req.connection_info().host().to_owned();

    let mut new_link = Parts::default();
    new_link.scheme = Some(Scheme::HTTPS);
    new_link.authority = Some(
        Authority::from_maybe_shared(req_host)
            .unwrap_or_else(|_| Authority::from_static("mrandl.fr")),
    );
    new_link.path_and_query = req.uri().path_and_query().cloned();

    let redirect_url = Uri::from_parts(new_link).unwrap_or(Uri::from_static("https://mrandl.fr"));

    let response = HttpResponse::PermanentRedirect()
        .insert_header(("Location", redirect_url.to_string()))
        .finish();

    Ok(response)
}
