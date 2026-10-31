# Presigned direct-to-B2 uploads

The product caps artifacts at 5 MB, but Vercel caps serverless request bodies at ~4.5 MB, so large uploads cannot transit our API. Uploads therefore go direct from the client (browser or CLI) to B2 via S3-compatible presigned PUT URLs: the server validates filename/type/size/quota, signs a 15-minute PUT, and the client uploads straight to the bucket, then confirms registration. Uploads ≤4.5 MB may also use the direct multipart API endpoint, which keeps local disk-driver development and tests simple.

Rejected: lowering the cap to 4 MB (arbitrary product limit to satisfy a platform quirk) and proxying uploads through Server Actions with a raised body limit (still bounded by the platform cap, and doubles egress cost). Consequence: presigning is only available when `STORAGE_DRIVER=s3`; the disk driver rejects presign requests loudly rather than silently falling back.
