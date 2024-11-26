const express = require('express');
var session = require('express-session');
const http = require('http');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const WebSocket = require("ws");
const {createClient, LiveTranscriptionEvents} = require("@deepgram/sdk");
const {config} = require('dotenv');
const { console } = require('inspector');
const crypto = require('crypto');
const fs = require("fs");
const path = require("path");
const { readFile } = require('fs/promises');
config();

const client = createClient(process.env.DEEPGRAM_SECRET);
const interval = 1000;
let aiResponded = false;

const app = express();
var sess = {
    secret: 'canucksrule',
    cookie: {},
    getSessionId: function(req){return genuuid(req)},
    genid: function(req){return genuuid(req)}
}

if (app.get('env') === 'production') {
    app.set('trust proxy', 1) // trust first proxy
    sess.cookie.secure = true // serve secure cookies
}

app.use(cookieParser('canucksrule'));
app.use(bodyParser.json());

app.use(session(sess))
const server = http.createServer(app);
const wss = new WebSocket.Server({server});
let keepAlive;

app.use(express.static("public/"));
app.use("/audio", express.static("audio"));

// Use this code if accessing deepgram transcription from the backend
/* const setupDeepgram = (ws, lang) => {
    const deepgram = client.listen.live({
        smart_format: true,
        model: "nova-2",
        language: lang,
        interim_results: true,
        utterance_end_ms: `${interval}`
    });
    
    if(keepAlive){
        clearInterval(keepAlive);
    }
    keepAlive = setInterval(() => {
        console.log("deepgram: keep alive");
        deepgram.keepAlive();
        if(!aiResponded){
            ws.send(JSON.stringify({finished: true}));
            aiResponded = true;
        }
    }, 10 * interval);

    deepgram.addListener(LiveTranscriptionEvents.Open, async () => {
        console.log("deepgram: connected");

        deepgram.addListener(LiveTranscriptionEvents.Transcript, (data) => {
            console.log("deepgram: transcript received");
            console.log("ws: transcript sent to client");
            if(data.is_final){
                aiResponded = false;
                ws.send(JSON.stringify(data));
            }
        });

        deepgram.addListener(LiveTranscriptionEvents.Close, async () => {
            console.log("deepgram: connection closed");
            //clearInterval(keepAlive);
            //deepgram.finalize();
        });

        deepgram.addListener(LiveTranscriptionEvents.Error, async (error) => {
          console.log("deepgram: error received");
          console.error(error);
        });
    
        deepgram.addListener(LiveTranscriptionEvents.Warning, async (warning) => {
          console.log("deepgram: warning received");
          console.warn(warning);
        });
    
        deepgram.addListener(LiveTranscriptionEvents.Metadata, (data) => {
          console.log("deepgram: metadata received");
          console.log("ws: metadata sent to client");
          ws.send(JSON.stringify({ metadata: data }));
        });
    });
    return deepgram;
};

wss.on("connection", (ws, req) => {
    console.log("ws: client connected");
    let language = req.headers["accept-language"].split(",")[0].trim()
    language = getLanguage(language);
    let deepgram = setupDeepgram(ws, language);
    
    ws.on("message", (msg) => {
        console.log("ws: data received");
        
       if(deepgram.getReadyState() === 1){
            console.log("ws: data sent to deepgram");
            deepgram.send(msg);
        }else if(deepgram.getReadyState() >= 2){
            console.log("ws: data couldn't be sent to deepgram");
            console.log("ws: retrying connection to deepgram");

            deepgram.finalize();
            deepgram.removeAllListeners()
            deepgram = setupDeepgram(ws, language);
        }else{
            console.log("ws: data couldn't be sent to deepgram");
        }
    });

    ws.on("close", () => {
        console.log("ws: client disconnected");
        deepgram.finalize();
        deepgram.removeAllListeners();
        deepgram = null;
    });
}); */

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/html/index.html");
});

app.get("/key", async (req, res) => {
    const projectId = await getProjectId();
    const key = await getTempApiKey(projectId);
    
    res.json(key);
})

app.post("/api", async(req, res) => {
    var t = await import('./modules/trainer.js');
    var g = await import('./modules/groqtrainer.js');
    const data = req.body;
    let response, trainer, conversation;
    const groqModels = {
        llama: "llama3-8b-8192",
        mixtral: "mixtral-8x7b-32768", 
        gemma: "gemma-7b-it"
    };
    if(req.session.trainer){
        if(data.model == 'gpt'){
            trainer = t.Trainer.load(req.session.trainer)

        }else{
            trainer = g.GroqTrainer.load(req.session.trainer, groqModels[data.model])
        }
    }else{
        if(data.model){
            if(data.model === 'gpt'){
                trainer = new t.Trainer();                
            }else{
                trainer = new g.GroqTrainer(groqModels[data.model], req.sessionID)
            }
            req.session.trainer = trainer
        }else{
            res.sendStatus(404);
            res.end();
        }        
    }
    
    if(req.session.conversation){
        var c = await import('./modules/conversation.js');
        conversation = c.Conversation.load(req.session.conversation);
    }else{
        if(data.model === 'gpt'){                
            conversation = await getConversation(data, true);
            await trainer.init(conversation.messages);
            conversation.thread = trainer.thread_id;
            conversation.last_message = trainer.lastmessage;
        }else{
            conversation = await getConversation(data);
        }
    }

    if(data.model == "gpt"){
        response = await trainer.addMessageAndRun(data.message);
    }else{
        if(!conversation.last_message || conversation.last_message === ""){
            response = await trainer.init(data.patient, conversation.messages, data.message);
        }else{
            response = await trainer.addMessage(data.message);
        }
    }
    conversation.update(data.message, "user", false);
    conversation.update(response, "ai");
    
    conversation.last_message = response;
    req.session.conversation = conversation;
    let json = {
        "message": response
    };

    try{
        const filePath = await getAudio(response, data.voice);
        json["audioUrl"] = filePath;
    } catch (err){
        console.error(err);
    }
    res.send(json);
    res.end();
});

app.post("/voice", async (req, res) =>{
    const body = req.body;
    const { text, model } = body;
  
    try {
      const filePath = await getAudio(text, model);
      res.send({ audioUrl: filePath });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
});

server.listen(process.env.PORT, () => {
    console.log(`listening on http://localhost:${process.env.PORT}`);
});

const getAudio = async (text, model) => {
    const response = await client.speak.request({ text }, { model });
    const stream = await response.getStream();
  
    if (stream) {
      const buffer = await getAudioBuffer(stream);
  
      try {
        // Ensure 'audio' directory exists
        const audioDirectory = path.join(__dirname, "audio");
        if (!fs.existsSync(audioDirectory)) {
          fs.mkdirSync(audioDirectory);
        }
  
        // Write audio file to 'audio' directory
        await new Promise((resolve, reject) => {
          fs.writeFile(path.join(audioDirectory, "audio.wav"), buffer, (err) => {
            if (err) {
              console.error("Error writing audio to file:", err);
              reject(err);
            } else {
              console.log("Audio file written to audio.wav");
              resolve();
            }
          });
        });
      } catch (err) {
        throw err;
      }
  
      return "/audio/audio.wav";
    } else {
      console.error("Error generating audio:", stream);
      throw new Error("Error generating audio: Stream is empty");
    }
};

// Helper function to convert stream to audio buffer
const getAudioBuffer = async (response) => {
    const reader = response.getReader();
    const chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
    }

    const dataArray = chunks.reduce(
        (acc, chunk) => Uint8Array.from([...acc, ...chunk]),
        new Uint8Array(0)
    );

    return Buffer.from(dataArray.buffer);
};

async function getConversation(data, isGPT = false){
    var obj = await import('./modules/conversation.js');
    let retval = new obj.Conversation();
    retval.key = `${data.topic}:${data.subtopic}`;
    retval.thread = "";
    retval.last_message = "";
    retval.messages = [];
    retval.initialized = true;
    return retval;
}

async function loadProfile(){
    try{
        let path = `./public/js/patient_profile_emily_nguyen.json`;
        let data = readFile(path, {encoding: 'utf8'});  
        return data;
    } catch(err){
        console.error(err);
        return {};
    }
}

async function getProjectId(){
    const {result, error} = await client.manage.getProjects();

    if(error){
        throw error;
    }

    return result.projects[0].project_id;
}

async function getTempApiKey(projectId){
    const{result, error} = await client.manage.createProjectKey(projectId, {
        comment: "short lived",
        scopes: ["usage:write", "keys:write"],
        time_to_live_in_seconds: 300,
    });

    if(error){
        throw error;
    }

    return result;
}

function genuuid(req){
    if(req.sessionID){
        return req.sessionID;
    }else{
        return crypto.randomUUID();
    }
}

function getLanguage(lang){
    const languages = [
        'bg',
        'ca',
        'zh',
        'zh-CN',
        'zh-Hans',
        'zh-TW',
        'ZH-Hant',
        'zh-HK',
        'cs',
        'da',
        'da-DK',
        'nl',
        'en',
        'en-US',
        'en-AU',
        'en-GB',
        'en-NZ',
        'en-IN',
        'et',
        'fi',
        'nl-BE',
        'fr',
        'fr-CA',
        'de',
        'de-CH',
        'el',
        'hi',
        'hu',
        'id',
        'it',
        'ja',
        'ko',
        'ko-KR',
        'lv',
        'lt',
        'ms',
        'multi',
        'no',
        'pl',
        'pt',
        'pt-BR',
        'pt-PT',
        'ro',
        'ru',
        'sk',
        'es',
        'es-419',
        'sv',
        'sv-SE',
        'th',
        'th-TH',
        'tr',
        'uk',
        'vi'
    ];
    if(languages.indexOf(lang) >= 0){
        return lang;
    }else{
        lang = lang.split('-')[0];
        if(languages.indexOf(lang) >= 0){
            return lang;
        }else{
            return 'en'; // default to English
        }
    }
}