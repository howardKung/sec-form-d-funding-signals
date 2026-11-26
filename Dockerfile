# Use official Apify Node.js 22 image (lightweight, zero headless browser overhead)
FROM apify/actor-node:22

# Copy package files and install production dependencies
COPY --chown=myuser:myuser package*.json ./

RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version

# Copy source code
COPY --chown=myuser:myuser . ./

# Run the Actor
CMD ["npm", "start", "--silent"]
