# Scout DB Build — Cloud Run Job
# Clones football scout server repo, runs build (12-14h), pushes to git.
# Python + git for the build script.

FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# run.sh is the entry point
COPY run.sh /run.sh
RUN chmod +x /run.sh

CMD ["/run.sh"]
