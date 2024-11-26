var isRecording = false;
var message = "";
var topics;
const PLAY_STATES = {
  NO_AUDIO: "no_audio",
  LOADING: "loading",
  PLAYING: "playing",
};
const interval = 1000;
const recordBox = document.querySelector("#record");
const listenButton = document.querySelector('label[for="record"]');
const errorMessage = document.querySelector("#error-message");
const topicSelect = document.getElementById('topic');
const subtopicSelect = document.getElementById('subtopic');
const modelSelect = document.getElementById("voice");
let playState = PLAY_STATES.NO_AUDIO;
let audio;

recordBox.addEventListener("click", (event) => {
  event.preventDefault();
});

async function getMicrophone() {
  try {
    const userMedia = await navigator.mediaDevices.getUserMedia({ audio: true });

    return new MediaRecorder(userMedia);
  }catch (error) {
    console.error("error accessing microphone:", error);
    throw error;
  }
}

async function openMicrophone(mediaRecorder, socket){
  await mediaRecorder.start(interval);

  mediaRecorder.onstop = () => {
    console.log("client: microphone closed");
    document.body.classList.remove("recording");
  };

  mediaRecorder.onstart = () => {
    console.log("client: microphone opened");
    document.body.classList.add("recording");
  };
  
  mediaRecorder.ondataavailable = (event) => {
    const data = event.data;
    if(data.size > 0){
      console.log("client: microphone data received");
      socket.send(data);
    }
  };
}

async function getTempApiKey(){
  const result = await fetch("/key");
  const json = await result.json();
  return json.key;
}

window.addEventListener("load", async () => {
  if(navigator.mediaDevices){
    await navigator.mediaDevices.getUserMedia({audio: true});
  }
  
  const key = await getTempApiKey();
  const {createClient} = deepgram;
  const _deepgram = createClient(key);
  const lang = getLanguage();

  //const socket = new WebSocket(`ws://${window.location.host}`);
  const socket = _deepgram.listen.live({
    smart_format: true,
    model: "nova-2",
    language: lang,
    interim_results: true,
    utterance_end_ms: `${interval}`,
    vad_events: true,
    endpointing: 1000
  });

  socket.on("open", async () => {
    console.log("client: connected to websocket");
    socket.on("Results", async (data) =>{      
      //console.log(data.channel.alternatives[0].transcript);
      if (data && data.channel && data.channel.alternatives[0].transcript !== "" && data.is_final) {
        message += `${data.channel.alternatives[0].transcript} `;
        builder(`${data.channel.alternatives[0].transcript} `, "user", false);
      }
    });

    setInterval(() => {

        const keepAlive = JSON.stringify({type: "KeepAlive"});
        socket.send(keepAlive);
        console.log("Keep Alive Sent");
      
    }, 3000);
  });  
  
  socket.on("error", (e) => console.error(e));
  
  socket.on("warning", (e) => console.warn(e));
  
  socket.on("Metadata", (e) => console.log(e));
  
  socket.on("close", (e) => console.log(e));
  
  await start(socket);
});
      

async function closeMicrophone(mediaRecorder) {
  isRecording = false;
  recordBox.checked = false;
  document.body.classList.remove("recording");
  if(mediaRecorder){
    mediaRecorder.stop();
    await send();  
  }
}

async function start(socket) {
  let mediaRecorder;
  //var language = navigator.language;
  //socket.send({lang: language}); 
  console.log("client: waiting to open microphone");
  
  listenButton.addEventListener("click", async() => {
    if (!mediaRecorder) {
      isRecording = true;
      recordBox.checked = true;
      mediaRecorder = await getMicrophone();
      await openMicrophone(mediaRecorder, socket);
      builder(null, "init", false);
    }else{          
      await closeMicrophone(mediaRecorder);
      mediaRecorder = undefined;
    }    
  });
}

function builder(msg, role, transcribingComplete){
  const messageContainer = document.getElementById('messages');
  switch(role){
    case "init":
      let nodes = [];
      // building the speech bubble for user
      let div = document.createElement('div');
      nodes[0] = document.createElement('div');
      nodes[0].innerHTML = msg;
      nodes[0].classList.add("message");
      nodes[0].classList.add("u-message");
      nodes[0].classList.add("typing");
      nodes[0].innerHTML = '<img src="../images/typing.svg" />';
      nodes[1] = document.createElement('img');
      nodes[1].src = "../images/user.png";
      div.append(...nodes);
      if(messageContainer.children.length > 0){
        messageContainer.insertBefore(div, messageContainer.children[0]);
      }else{
        messageContainer.append(div);
      }
      break;
    case "user":
      if(!transcribingComplete){
        let userBubble = messageContainer.children[0].querySelector(".u-message");
        if(userBubble.classList.contains('typing')){
          userBubble.classList.remove('typing');
          userBubble.innerHTML = msg;
        }else{
          userBubble.innerHTML = userBubble.innerHTML + msg;
        }
      }else{
        // build the speech bubble for the AI response
        let nodes = [];
        let div = document.createElement('div');
        nodes[0] = document.createElement('img');
        nodes[0].src = "../images/emily.jpg";
        nodes[1] = document.createElement('div');
        nodes[1].innerHTML = '<img src="../images/typing.svg" />';
        nodes[1].classList.add("message");
        nodes[1].classList.add("p-message");
        div.append(...nodes);
        messageContainer.insertBefore(div, messageContainer.children[0]);        
      }
      break;
    case "ai":
      // fill the AI speech bubble with response
      messageContainer.children[0].querySelector(".p-message").innerHTML = msg;
      break;
  }
}

async function send(){
    builder("", "user", true);
    const params = new URLSearchParams(document.location.search);
    const xhr = new XMLHttpRequest();
    let data = {
      'model': params.get("model"),
      'voice': modelSelect.options[modelSelect.selectedIndex].value,
      'name': document.getElementById('name').value,
      'topic': topicSelect.value,
      'subtopic': subtopicSelect.value,
      'patient': 'Emily Nguyen',
      'message': message
    };
    xhr.onreadystatechange = async function(){
      if(this.readyState == 4 && this.status == 200){
        let res = xhr.responseText;
        let json = JSON.parse(res);
        if(json.message){
          builder(json.message, "ai", true)
          playAudio(json.audioUrl, false);
          message = "";  
        }else{
          console.error(xhr.responseText);
          message= "";
        }
      }
    };
    xhr.open('POST', '/api');
    xhr.setRequestHeader('content-type', 'application/json')
    xhr.send(JSON.stringify(data));
}

// Function to update the play button based on the current state
function updatePlayButton() {
  const playButton = document.getElementById("play-button");
  const icon = playButton.querySelector(".button-icon");

  switch (playState) {
    case PLAY_STATES.NO_AUDIO:
      icon.className = "button-icon fa-solid fa-play";
      break;
    case PLAY_STATES.LOADING:
      icon.className = "button-icon fa-solid fa-circle-notch ";
      break;
    case PLAY_STATES.PLAYING:
      icon.className = "button-icon fa-solid fa-stop";
      break;
    default:
      break;
  }
}

// Function to play audio
function playAudio(audioUrl, isPlayButton = true) {
  if (audio) {
    stopAudio(isPlayButton);
  }
  currentAudioUrl = audioUrl + "?t=" + new Date().getTime(); // Add cache-busting query parameter
  audio = new Audio(currentAudioUrl);

  audio.play();

  audio.addEventListener("ended", () => {
    //console.log("Audio finished playing");
    stopAudio(isPlayButton);
  });
}

// Function to stop audio
function stopAudio(isPlayButton) {
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    playState = PLAY_STATES.NO_AUDIO;
    if(isPlayButton){
      updatePlayButton();
    }
  }
}

// Function to handle the click event on the play button
function playButtonClick() {
  switch (playState) {
    case PLAY_STATES.NO_AUDIO:
      playSample();
      break;
    case PLAY_STATES.PLAYING:
      stopAudio(true);
      playState = PLAY_STATES.NO_AUDIO;
      updatePlayButton();
      break;
    default:
      break;
  }
}

// Function to send data to backend
function playSample() {  
  const selectedModel = modelSelect.options[modelSelect.selectedIndex].value;
  const textInput = document.getElementById("test").value;
  playState = PLAY_STATES.LOADING;
  updatePlayButton();

  const data = {
    model: selectedModel,
    text: textInput,
  };
  fetch("/voice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      //console.log("Response received from server:", data);
      playAudio(data.audioUrl);
      playState = PLAY_STATES.PLAYING;
      updatePlayButton();
    })
    .catch((error) => {
      console.error("There was a problem with your fetch operation:", error);
      playState = PLAY_STATES.NO_AUDIO;
      updatePlayButton();
    });
}

document.getElementById("play-button").addEventListener("click", playButtonClick);

function populateTopics(){
  var pathToFile ='./js/topics.json';  
  fetch(pathToFile)
    .then((response) => {
      return response.json();
    })
    .then((data) => {
      topics = data['topics']
      for (let i = 0; i < topics.length; i++) {
        let el = topics[i].topic;
        let option = document.createElement('option');
        option.text = el;
        option.value = el;
        topicSelect.add(option);
      }
      populateSubTopics();
    })
    .catch((error) =>
      console.error("Unable to fetch data:", error));
}

function populateSubTopics(){
  subtopicSelect.innerHTML = null;
  let topic = topicSelect.value;
  for (let i = 0; i < topics.length; i++) {
    if(topics[i].topic === topic){
      let subtopics = topics[i].subtopics;
      for(let j = 0; j < subtopics.length; j++){
        let el = subtopics[j].name;
        let option = document.createElement('option');
        option.text = el;
        option.value = el;
        subtopicSelect.add(option);
      }
      break;
    }
  }
}

topicSelect.addEventListener("change", populateSubTopics);

function toggleModal(content){
  let modal = document.getElementById(content);
  let overlay = document.querySelector('.overlay');
  modal.classList.toggle('hidden');
  document.body.classList.toggle('overflow-hidden');
  overlay.classList.toggle('hidden');
}

function getLanguage(){
  let lang = navigator.language;
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