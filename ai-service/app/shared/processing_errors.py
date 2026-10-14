"""Safe failure codes; never copy storage exception text into tasks or events."""
from minio.error import InvalidResponseError, S3Error, ServerError
from urllib3.exceptions import HTTPError


class ProcessingFailure(Exception):
    def __init__(self, code: str, *, retryable: bool = False):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


def storage_failure(exception: Exception) -> ProcessingFailure:
    if isinstance(exception, S3Error):
        if exception.code in {"NoSuchKey", "NoSuchObject", "NoSuchBucket"}:
            return ProcessingFailure("SOURCE_OBJECT_NOT_FOUND")
        if exception.code in {"AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch"}:
            return ProcessingFailure("SOURCE_STORAGE_ACCESS_DENIED")
        if exception.code in {"SlowDown", "ServiceUnavailable", "InternalError", "RequestTimeout"}:
            return ProcessingFailure("SOURCE_STORAGE_UNAVAILABLE", retryable=True)
    if isinstance(exception, ServerError):
        status = exception.status_code
        if status == 429 or status >= 500:
            return ProcessingFailure("SOURCE_STORAGE_UNAVAILABLE", retryable=True)
    if isinstance(exception, InvalidResponseError):
        # MinIO exposes no public status property for non-XML responses. A proxy
        # outage may return HTML; bounded retries are safer than parsing its body.
        return ProcessingFailure("SOURCE_STORAGE_UNAVAILABLE", retryable=True)
    if isinstance(exception, (HTTPError, ConnectionError, TimeoutError)):
        return ProcessingFailure("SOURCE_STORAGE_UNAVAILABLE", retryable=True)
    return ProcessingFailure("SOURCE_STORAGE_READ_FAILED")
