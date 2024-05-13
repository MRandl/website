use actix_web::{
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    http::header::{HeaderValue, STRICT_TRANSPORT_SECURITY},
};
use actix_web_lab::middleware::Next;

pub async fn force_hsts(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> actix_web::Result<ServiceResponse<impl MessageBody>> {
    let fut: _ = next.call(req);
    let mut res = fut.await?;
    let hdrs = res.headers_mut();
    hdrs.insert(
        STRICT_TRANSPORT_SECURITY,
        HeaderValue::from_static("max-age=63072000; includeSubDomains; preload"),
    );
    Ok(res)
}
