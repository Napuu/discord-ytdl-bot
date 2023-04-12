require('dotenv').config()
const spawn = require('child_process').spawn;
const { Client } = require("discord.js");
const yt = require('youtube-search-without-api-key');
const { nanoid } = require("nanoid");
const fs = require('fs').promises;
const client = new Client({ intents: ["GUILDS", "GUILD_MESSAGES"] });
const moment = require('moment');
const {randomInt} = require('crypto')
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const promptDivider = "DIVIDER"
const positivePrefix = "Positiivinen: "
const negativePrefix = "Negatiivinen: "
const tuplaCompletion = async (act) => (
    openai.createCompletion({
      model: "text-davinci-003",
      prompt: `Lähtökohta: Tuplilla Pekka menee töihin.${promptDivider}${positivePrefix}Tuplat, Pekka menee töihin.${promptDivider}${negativePrefix}Ei tuplia, Pekka ei mene töihin.${promptDivider}Lähtökohta: Tuplilla ${act}.${promptDivider}`,
      temperature: 0.7,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    })
)

client.once('ready', () => {
    console.log('Bot is running!');
});
const prefix = "!";
client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const commandBody = message.content.slice(prefix.length);
    const args = commandBody.split(' ');
    const command = args.shift()
    const noppa = () => randomInt(1, 7)
    const sleepMillis = (ms) => new Promise(resolve => setTimeout(resolve, ms))

    if (command === "ping") {
        const timeTaken = Date.now() - message.createdTimestamp;
        message.reply(`Pong! This message had a latency of ${timeTaken}ms.`);
    }
    else if (command === "s") {
        const searchTerm = args.join(' ')
        const videos = await yt.search(searchTerm);
        const topResults = videos.length > 9 ? videos.slice(0, 9) : videos
        const shortVideo = topResults.find(x => moment(x.duration_raw, "mm:ss").minutes() < 1)
        if (shortVideo) {
            return await handleProcess(message, shortVideo.url, true)
        } else {
            return message.reply(`Hyvä hakusana.... no videos under 1minute found from top 10 results ${Date.now() - message.createdTimestamp}ms`);
        }
    } else if (command === "noppa") {
        return message.reply(`${noppa()}`);
    } else if (command === "tuplat") {
        const noppa1 = noppa()
        const noppa2 = noppa()
        message.reply(`Noppa 1: ${noppa1}`)
        message.channel.sendTyping()
        await sleepMillis(noppa()*2000)
        message.reply(`Noppa 2: ${noppa2}`)
        message.reply(noppa1 === noppa2 ? 'Tuplat tuli 😎' : 'Ei tuplia 😿');
    } else if (command === "tuplilla") {
        const act = message.content.split("!" + command).slice(1)
        if (act === "") {
            return message.reply("Hyvä viesti...")
        } else {
            const noppa1 = noppa()
            const noppa2 = noppa()
            message.reply(`Noppa 1: ${noppa1}`)
            message.channel.sendTyping()
            const completionText = (await tuplaCompletion(act)).data.choices[0].text
            let answerCompletion = ""
            const tuplat = noppa1 === noppa2
            if (completionText) {
                const answers = completionText.split("DIVIDER")
                if (answers.length === 2) {
                    if (tuplat) {
                        answerCompletion = answers.find(answer => answer.startsWith(positivePrefix))
                    } else {
                        answerCompletion = answers.find(answer => answer.startsWith(negativePrefix))
                    }
                }
            }
            await sleepMillis(noppa()*1000)
            message.reply(`Noppa 2: ${noppa2}`)
            message.reply(tuplat ? 'Tuplat tuli 😎' : 'Ei tuplia 😿' + ' - ' + answerCompletion);
        }
    }
    else if (isValidHttpUrl(command)) {
        message.suppressEmbeds(true)
        await handleProcess(message, command)
    }
});


const handleProcess = async (message, url, reply) => {
    message.channel.sendTyping()
    const filename = await downloadVideo(url)
    if (!filename) return message.reply(`Hyvä linkki... failed to ytdl... ${Date.now() - message.createdTimestamp}ms`);
    if (await getFileSize(filename) > 8) {
        const smaller = await transcode(filename, 39)
        if (!smaller) return message.reply(`Hyvä linkki... failed to transcode ${Date.now() - message.createdTimestamp}ms`)
        const smallerSize = await getFileSize(`output-${filename}`)
        if (smallerSize > 8 ) return message.reply(`Hyvä linkki... after downgrade filesize was: ${smallerSize}Mb`)
    } else {
        await fs.rename(filename, `output-${filename}`)
    }

    if (reply) {
        message.reply({ files: [`output-${filename}`] })
    } else {
        message.channel.send({ files: [`output-${filename}`] })
        message.delete()
    }
}

client.login(process.env.TOKEN)

const getFileSize = async filename => {
    const stats = await fs.stat(filename)
    const fileSizeInBytes = stats.size;
    const fileSizeInMegabytes = fileSizeInBytes / (1024 * 1024);
    return fileSizeInMegabytes
}

const downloadVideo = async (link) => new Promise((resolve, reject) => {
    const filename = nanoid(8)
    console.log("starting to download: ", link)
    const ytdlp = spawn('yt-dlp', [
        "--verbose",
	"--no-playlist",
	"--no-playlist",
        "-f",
        "((bv*[filesize<=6M]/bv*)[height<=720]/(wv*[filesize<=6]/wv*)) + ba / (b[filesize<=6M]/b)[height<=720]/(w[filesize<=6M]/w)",
        "-S",
        "codec:h264",
        "--merge-output-format",
        "mp4",
        "-o",
        `${filename}.%(ext)s`,
        `${link}`
    ]);
    ytdlp.stderr.on('data', (data) => {
        console.log(data.toString())
    });
    ytdlp.stdout.on('data', (data) => {
        console.log(data.toString())
    });
    ytdlp.on('close', async (code) => {
        const files = await fs.readdir(__dirname);
        resolve(files.find(x => x.includes(filename)));
    });
});
const transcode = (filename, crf) => new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-i', 
        `${filename}`, 
        '-c:v', 
        'libx264', 
        '-preset', 
        'veryfast', 
        "-crf", 
        crf, 
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        `output-${filename.split(".")[0]}.mp4`
    ])
    ffmpeg.stderr.on('data', (data) => {
        console.log(`${data}`);
    });
    ffmpeg.on('close', async (code) => {
        const duration = await getVideoLength(`output-${filename}`)
        resolve(duration > 0)
    });
});

const isValidHttpUrl = (string) => {
    let url;
    try {
        url = new URL(string);
    } catch (_) {
        return false;
    }
    return url.protocol === "http:" || url.protocol === "https:";
}

const getVideoLength = (filename) => new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filename]);
    let duration = 0
    ffprobe.stderr.on('data', (data) => {
        console.log(`${data}`);
    });
    ffprobe.stdout.on('data', (data) => {
        duration = data.toString()
    });
    ffprobe.on('close', (code) => {
        if (code === 0) {
            resolve(Number(duration));
        }
        resolve(-1)
    });
});

// https://trac.ffmpeg.org/wiki/Encode/H.264#twopass
const calculateBitrate = (seconds) => {
    // (8 MiB * 8192 [converts MiB to kBit]) / x seconds
    const videoSizekBit = (8 * 8192) / seconds
    // videoSizekBit - 128 kBit/s (desired audio bitrate) = x kBit/s video bitrate
    const fileSizekBit = videoSizekBit - 128
    return fileSizekBit
}
