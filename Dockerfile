# syntax=docker/dockerfile:1
FROM node:12.22.1
ENV NODE_ENV=production
WORKDIR /app
COPY ["package.json", "package-lock.json*", "./"]
RUN npm install --production
COPY . .
CMD [ "node", "./solar-arrays/readSolarPanels.js"]