FROM node:22-alpine

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Set default environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--experimental-specifier-resolution=node"
ENV NODE_NO_WARNINGS=1
ENV OPEN_BROWSER=false
ENV HOST=${HOST:-0.0.0.0}
ENV PORT=${PORT:-3000}

# Expose port (will be overridden by .env)
EXPOSE ${PORT}

# Start the application
CMD ["node", "server.js"]
