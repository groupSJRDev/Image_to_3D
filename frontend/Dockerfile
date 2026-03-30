FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN groupadd -r app && useradd -r -g app -u 1000 app && chown -R app:app /app
USER app
EXPOSE 3010
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3010"]
