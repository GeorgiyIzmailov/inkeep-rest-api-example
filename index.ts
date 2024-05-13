import type { RecordsCited$, MessageChunk$ } from "@inkeep/ai-api/models/components";
import { createParser, type ParsedEvent, type ReconnectInterval } from 'eventsource-parser';

require('dotenv').config();

function decodeUTF8(uint8Array: Uint8Array) {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(uint8Array);
}

function onParse(event: ParsedEvent | ReconnectInterval) {
  let chatSessionId: string | undefined | null = undefined;

  if ('data' in event) {
    if (event.event == "message_chunk") {
      const chatResultStreamMessageChunk: MessageChunk$.Inbound = JSON.parse(event.data);
      console.log("Partial message: " + chatResultStreamMessageChunk.content_chunk);
      chatSessionId = chatResultStreamMessageChunk.chat_session_id;
    }
    if (event.event == "records_cited") {
      const chatResultStreamRecordsCited: RecordsCited$.Inbound = JSON.parse(event.data);
      console.log("Citations: ", JSON.stringify(chatResultStreamRecordsCited.citations, null, 2));
    }
  }
}

const parser = createParser(onParse)

async function processSSEStream(response: Response) {
  const reader = response.body.getReader();

  if (!reader) {
    throw new Error("No reader found");
  }

  return {
    async next() {
      const { done, value } = await reader.read();
      const textChunk = decodeUTF8(value);
      return { done, value: done ? undefined : textChunk };
    },
    return() {
      reader.cancel();
      return Promise.resolve({ done: true });
    },
    throw(error: Error) {
      reader.cancel();
      return Promise.reject(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    }
  };
}

async function callInkeepAPI(question: string) {
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

  return processSSEStream(response);
}

async function main() {
  console.log("calling inkeep api");
  try {
    const stream = await callInkeepAPI('How do I get started?');
    for await (const chunk of stream) {
      parser.feed(chunk);
    }
  } catch (error) {
    console.error("Error in main:", error);
  }
}

main();