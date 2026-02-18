# Base for Cursor cloud/background agents. Do NOT copy code — the agent clones the repo.
# Include only runtimes and dev tools you need.

FROM node:20-bookworm

# Create non-root user and set home (per Cursor cloud agent guidelines)
RUN useradd -m -s /bin/bash ubuntu
USER ubuntu
WORKDIR /home/ubuntu

# Dev tools (adjust to match your stack)
# Node/npm are already in the image; add global CLI tools if needed, e.g.:
# RUN npm install -g typescript ts-node
