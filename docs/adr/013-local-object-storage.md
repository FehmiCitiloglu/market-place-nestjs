# ADR-013: Local object storage — MinIO server from a digest-pinned Chainguard build

- Status: Accepted
- Date: 2026-10-21
- Deciders: Mercato engineering team

## Context

The original plan (and the project brief) specified MinIO as the local
S3-compatible object store for development and integration testing. In 2026
the situation around MinIO distribution changed materially:

- MinIO Community Edition entered maintenance mode (December 2025) and the
  upstream repository was archived in April 2026; Community Edition is now
  described as source-only and unmaintained.
- The `minio/minio` and `minio/mc` repositories were removed from Docker Hub
  around 2026-09-12; pinned historical releases stopped resolving
  (`pull access denied ... repository does not exist`).
- The Quay mirrors stopped serving anonymously shortly afterwards
  (`unauthorized: access to the requested resource is not authorized`), which
  also broke downstream projects (e.g. Apache Gravitino, SeaTunnel, IBM
  Storage Fusion advisories).

The application requires an S3-compatible store locally with: bucket
separation (public/private), presigned GET URLs, and standard PUT/GET/multipart
semantics — exercised through the AWS SDK v3 against a configurable
`S3_ENDPOINT`.

## Options considered

1. **`minio/minio` from Docker Hub (original plan).** Rejected: repository is
   gone; builds that reference it fail reproducibly.
2. **`quay.io/minio/minio` historical releases.** Rejected: anonymous pulls
   return 401; not reproducible for a fresh contributor.
3. **LocalStack (S3 service).** Rejected: the current image refuses to start
   without `LOCALSTACK_AUTH_TOKEN` license activation, which violates the
   "runs locally without paid services" requirement. Verified empirically
   (container exit code 55, "License activation failed").
4. **`bitnamilegacy/minio` frozen images.** Rejected: third-party legacy
   namespace, explicitly unmaintained; acceptable as an emergency pin but not
   as the documented default.
5. **A different S3-compatible server (Zenko CloudServer, Garage).** Rejected
   for now: CloudServer's images are stale (last published 2023); Garage has
   narrower S3 semantics (e.g. presigned URL coverage) that would weaken the
   fidelity of the upload/signing tests.
6. **MinIO built from source by Chainguard (`cgr.dev/chainguard/minio`),
   pinned by digest.** Accepted. Chainguard rebuilds MinIO from source
   continuously; the image is anonymously pullable, runs as a non-root user
   (uid 65532), ships `minio`, `mc` and a shell, and works with the standard
   MinIO server semantics our tests rely on. The free tier only publishes a
   `latest` tag, so reproducibility is provided by pinning the image digest in
   `docker-compose.yml` instead of a version tag.

## Decision

Local development and CI run `cgr.dev/chainguard/minio` pinned by digest in
`docker-compose.yml`, with bucket provisioning via `mc` in a one-shot init
service. The application talks to object storage exclusively through an S3
client configured from environment variables (`S3_ENDPOINT`, credentials,
buckets), so any S3-compatible provider can replace it without code changes —
including a hosted provider in a deployed environment.

## Trade-offs

- A digest pin is reproducible but not self-updating: upgrading means
  deliberately re-pinning a newer digest (documented in `docker-compose.yml`
  and covered by the dependency-update policy).
- Chainguard's free tier is a third-party distribution point; if it becomes
  unavailable, the fallback order is: (a) mirror the pinned digest into a
  registry we control, (b) switch to `bitnamilegacy/minio` pinned by digest,
  (c) evaluate a maintained alternative (Garage, Zenko) with a compatibility
  test pass. The `S3_ENDPOINT` abstraction keeps the blast radius to
  `docker-compose.yml` and `.env`.
- MinIO Community Edition being unmaintained is an accepted residual risk for
  **local development only**; production deployments are expected to use a
  hosted, supported S3 service (not part of this repository).

## Consequences

- `docker compose up` works for a fresh contributor with no registry accounts
  or paid services (verified 2026-10-21).
- The container runs as non-root, which is also reflected in the
  security-architecture document's infrastructure posture.
- Any future change of local object storage must keep the S3 API contract
  (presigned URLs, multipart, bucket policies) or the upload tests will fail —
  that failure mode is intentional and documented.
