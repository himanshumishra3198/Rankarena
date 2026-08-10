# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Injected at build time so they get baked into the JS bundle.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# GA4 measurement id. Left empty, the analytics tag never loads — so previews
# and local builds send nothing. Not a secret: it is visible in page source.
ARG VITE_GA_ID
ENV VITE_GA_ID=$VITE_GA_ID

# Google sign-in client id. Also not a secret — it identifies the app to
# Google and ships in the bundle regardless. Empty means the button is not
# rendered at all, rather than rendered and broken.
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID

RUN npm run build

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────────────
FROM nginx:alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
