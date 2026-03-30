FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN groupadd -r vmlapp && useradd -r -g vmlapp -u 1500 vmlapp && chown -R vmlapp:vmlapp /app
USER vmlapp
EXPOSE 3010
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3010"]
