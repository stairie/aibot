// A whole lotta imports
import { config } from "dotenv";
config()

import { ChatGroq } from '@langchain/groq';
import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
    MessagesPlaceholder
} from "@langchain/core/prompts";
import {HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { RunnableWithMessageHistory} from "@langchain/core/runnables";
import { OpenAIEmbeddings } from '@langchain/openai';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import fs from 'fs';
const messageHistories = {};

// Input data and paths
const instructionsFile = "instructions";
const txtPath = `./public/docs/${instructionsFile}.txt`;
const VECTOR_STORE_PATH = `${instructionsFile}.index`;

export class GroqTrainer{
    constructor(model, sessionId){
        this.model = new ChatGroq({
            model: model,
            temperature: 0.2,
            apiKey: process.env.GROQ_API_KEY
        });

        this.configuration = {
            configurable:{
                sessionId: sessionId
            }
        }
    }

    set model(model){
        this._model = model;
    }

    get model(){
        return this._model;
    }

    set configuration(config){
        this._configuration = config;
    }

    get configuration(){
        return this._configuration;
    }

    set thread_id(id){
        this._thread_id = id;
    }
    
    get thread_id(){
        return this._thread_id;
    }

    set lastmessage(msg){
        this._lastmessage = msg;
    }

    get lastmessage(){
        return this._lastmessage;
    }

    async getAIEmbeddings(patient){
        const embeddings = new OpenAIEmbeddings();
        let vectorstore;
        if(fs.existsSync(VECTOR_STORE_PATH)){
            vectorstore = await HNSWLib.load(VECTOR_STORE_PATH, embeddings);
        }else{
            const instructions = new TextLoader(txtPath);
            const docs = await instructions.load();
            vectorstore = await HNSWLib.fromDocuments(docs, embeddings);
        }

        return vectorstore;
    }

    retrieveInstructions(){
        try{
            const retval = fs.readFileSync(txtPath, 'utf8')
            return retval;
            //return "You are a helpful assistant who remembers all details the user shares with you."
        } catch (err){
            console.error(err);
            return "";            
        }
    }

    compileChatHistory(conversation){
        const chatHistory = [];
        for(let i = 0; i < conversation.length; i++){
            let message = conversation[i];
            let m;
            switch (message.role){
                case "user":
                    m = new HumanMessage(message.message);
                    break;
                case "ai":
                    m = new AIMessage(message.message);
                    break;
                default:
                    m = new SystemMessage(message.message);
                    break;
            }
            chatHistory.push(m);            
        }
        return chatHistory;
    }

    async init(patient, messageArray, message){
        const chatHistory = this.compileChatHistory(messageArray);
        
        const systemMessage = SystemMessagePromptTemplate.fromTemplate("{text}");
        const text = this.retrieveInstructions();
        const formatted = await systemMessage.format({text : text})
        chatHistory.push(formatted);
        const chatPrompt = ChatPromptTemplate.fromMessages(
            chatHistory.concat([
            new MessagesPlaceholder("chat_history"),
            HumanMessagePromptTemplate.fromTemplate("{input}")])
        );

        const chain = chatPrompt.pipe(this.model);

        const withMessageHistory = new RunnableWithMessageHistory({
            runnable: chain,
            getMessageHistory: async (sessionId) => {
                if(messageHistories[sessionId] === undefined){
                    messageHistories[sessionId] = new InMemoryChatMessageHistory();
                }
                return messageHistories[sessionId];
            },
            inputMessagesKey: "input",
            historyMessagesKey: "chat_history"
        });

        const response = await withMessageHistory.invoke(
            {
                input: message
            },
            this._configuration
        )
        
        console.log(response);
        return this.addLineBreaks(response.content);       
    }    

    async addMessage(message){
        //let vectorstore = await this.getAIEmbeddings(null);
        
        const chatPrompt = ChatPromptTemplate.fromMessages([
            new MessagesPlaceholder("chat_history"),
            HumanMessagePromptTemplate.fromTemplate("{input}")
        ]);

        const chain = chatPrompt.pipe(this.model);

        const withMessageHistory = new RunnableWithMessageHistory({
            runnable: chain,
            getMessageHistory: async (sessionId) => {
                if(messageHistories[sessionId] === undefined){
                    messageHistories[sessionId] = new InMemoryChatMessageHistory();
                }
                return messageHistories[sessionId];
            },
            inputMessagesKey: "input",
            historyMessagesKey: "chat_history"
        });

        const result = await withMessageHistory.invoke(
            {
                input: message
            },
            this._configuration
        );

        this.lastmessage = result.content;
        return this.addLineBreaks(result.content);
    }

    addLineBreaks(text){
        text = text.replace(/(?:\r\n|\r|\n)/g, "<br>");
        return text;
    }

    static load(data, model){
        let retModel = Object.assign(new GroqTrainer(), data);
        retModel.model = new ChatGroq({
            model: model,
            temperature: 0.2,
            apiKey: process.env.GROQ_API_KEY
        });
        return retModel;
    }
}