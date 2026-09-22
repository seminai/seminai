FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm install && npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/http.js"]
