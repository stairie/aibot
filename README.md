# AI Bot

## APIs Used:
* [Deepgram](https://deepgram.com/)
* [OpenAI](https://platform.openai.com/docs/overview)
* [GroqCloud](https://groq.com/)
* [Langsmith](https://www.langchain.com/langsmith)

## Requirements
* Node 18.0.0
* NPM 8.6.0

## Installation
1. Download this repo.
2. Open in code editor (Highly recommend VS Code)
3. In terminal, navigate to the directory you copied this repo into
4. Run `npm install`
5. Create a .env file with the following:
```
OPENAI_API_KEY=<YOUR_API_KEY>
ASSISTANT=<YOUR_ASSISTANT_ID>
GROQ_API_KEY=<YOUR_GROQ_API_KEY>
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=<YOUR_LANGSMITH_KEY>
DEEPGRAM_SECRET=<YOUR_DEEPGRAM_API_KEY>
PORT=3000
```
## Usage
Run `npm run start`, then navigate to `http://localhost:3000?model=<model_name>` where `<model_name>` is either __gpt__, __llama__, __mixtral__, or __gemma__. The __gpt__ model uses OpenAI, where the other models use GroqCloud.
