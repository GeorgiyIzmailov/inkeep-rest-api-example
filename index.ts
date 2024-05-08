import { createParser, type ParsedEvent, type ReconnectInterval } from 'eventsource-parser';

require('dotenv').config();

const callInkeepAPI = async (question: string): Promise<AsyncIterable<any>> => {
  const body = {
    chat_session: {
      messages: [
        {
          content: question,
          role: "user",
        },
      ],
    },
    chat_mode: process.env.CHAT_MODE,
    integration_id: process.env.INKEEP_INTEGRATION_ID,
    stream: true,
  };

  const response = await fetch('https://api.inkeep.com/v0/chat_sessions/chat_results', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.INKEEP_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }


  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No reader found");
  }

  const textDecoder = new TextDecoder();
  let eventQueue: any[] = [];

  const parser = createParser((event: ParsedEvent | ReconnectInterval) => {
    console.log("Parser event received:", event); // Log all events received by the parser
    if ('data' in event) {
      eventQueue.push(event.data);
    }
  });

  return (async function* () {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const textChunk = textDecoder.decode(value);
        console.log("Received chunk:", textChunk); // Log each chunk received
        parser.feed(textChunk);
        while (eventQueue.length > 0) {
          const event = eventQueue.shift();
          if (event) yield event;
        }
      }
    } catch (err) {
      console.error('Error reading SSE stream:', err);
    }
  })();
};

async function main() {
  console.log("calling inkeep api");
  try {
    const eventStream = await callInkeepAPI('how do i get started');
    for await (const event of eventStream) {
      console.log(event);
    }
  } catch (error) {
    console.error("Error in main:", error);
  }
}

main();