import logging
import azure.functions as func
from azure.storage.blob import BlobServiceClient
import os

def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        file = req.files['file']
        blob_service = BlobServiceClient.from_connection_string(os.environ["BLOB_CONN_STR"])
        container = blob_service.get_container_client("uploads")
        container.upload_blob(file.filename, file.stream, overwrite=True)

        # Optionally: send to Document Intelligence (not shown here for brevity)

        return func.HttpResponse(
            body='{"status": "Uploaded successfully"}',
            status_code=200,
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error: {e}")
        return func.HttpResponse(
            body='{"status": "Error uploading file"}',
            status_code=500,
            mimetype="application/json"
        )
