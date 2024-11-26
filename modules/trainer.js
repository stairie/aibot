import { config } from "dotenv";
config()

import OpenAI from 'openai';
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});


export class Trainer{
    constructor( ){}

    async init(messageArray){
        const thread = await openai.beta.threads.create();
        this.thread_id = thread.id;
        for(let i = 0; i < messageArray.length; i++){
            await this.addMessage(messageArray[i].message);
        }
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
    
    async run(){
        const run = await openai.beta.threads.runs.createAndPoll(
            this.thread_id,
            {
                assistant_id: process.env.ASSISTANT_ID
            }
        );      
    }

    async addMessage(msg){
        // console.log(this);
        const message = await openai.beta.threads.messages.create(
            this.thread_id,
            {
                role: "user",
                content: msg
            }
        )

        this.lastmessage = message.id;
    }

    async getLastMessage(){
        const messages = await openai.beta.threads.messages.list(
            this.thread_id,
            {
                order: 'asc',
                after: this.lastmessage
            }
        )
        // console.log(messages);
        this.lastmessage = messages.data[0].id;
        return messages.data[0].content[0].text.value;
    }

    async addMessageAndRun(msg){
        let retval = "";
        try{
            await this.addMessage(msg);
            await this.run();
            retval = await this.getLastMessage();

        }catch(error){
            console.log(error);
        }
        return retval;
    }

    static load(data){
        return Object.assign(new Trainer(), data);
    }
}