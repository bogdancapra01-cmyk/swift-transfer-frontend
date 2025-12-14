# build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# run stage (nginx)
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Cloud Run expects $PORT, nginx listens on 8080
RUN sed -i 's/listen\s\+80;/listen 8080;/' /etc/nginx/conf.d/default.conf
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
