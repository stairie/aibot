export class Conversation{
    
    constructor(){
    }

    set key(id){
        this._key = id
    }

    get key(){
        return this._key;
    }

    set thread(id){
        this._thread = id;
    }

    get thread(){
        return this._thread;
    }

    set last_message(id){
        this._last_message = id;
    }

    get last_message(){
        return this._last_message;
    }

    set messages(messageArray){
        this._messages = messageArray;
    }

    get messages(){
        return this._messages;
    }

    set initialized(foo){
        this._initialized = foo;
    }

    get initialized(){
        return this._initialized;
    }

    static load(data){
        return Object.assign(new Conversation(), data);
    }

    update(msg, role, ignore = false){
        let message = {
            role: role,
            message: msg,
            ignore: ignore
        };
        let messages = this.messages;
        messages.push(message);
        this.messages = messages;
    }
}