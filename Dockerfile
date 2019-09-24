FROM node:11-alpine
RUN mkdir -p /src/app
WORKDIR /src/app
COPY . /src/app
RUN npm install --production
EXPOSE 8080
CMD [ "node", "index.js" ]
