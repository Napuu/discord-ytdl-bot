FROM ubuntu:rolling
ARG DEBIAN_FRONTEND=noninteractive
WORKDIR /app
ENV TZ=Europe/Helsinki
RUN apt-get -qq update && apt-get -qq install zip git ffmpeg build-essential python3 nodejs npm > /dev/null 2>&1 && apt-get clean
RUN cd /tmp && git clone https://github.com/yt-dlp/yt-dlp --depth=1
RUN cd /tmp/yt-dlp && make yt-dlp && mkdir -p /usr/local/bin && mv yt-dlp /usr/local/bin/
COPY package.json package.json
COPY package-lock.json package-lock.json
COPY index.js index.js
RUN npm ci
CMD ["node", "index.js"]
