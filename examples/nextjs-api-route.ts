// pages/api/chat.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PromptArmorDetector, PromptArmorFilter, PromptArmorSanitizer } from 'prompt-armor';

// Initialize components
const detector = new PromptArmorDetector({
  enableHeuristics: true,
  enableML: false, // Use heuristics only for faster response
  logAttempts: true
});

const sanitizer = new PromptArmorSanitizer();
const filter = new PromptArmorFilter();

// Initialize detector
let initialized = false;
detector.initialize().then(() => {
  initialized = true;
});

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
}

interface ChatResponse {
  response?: string;
  error?: string;
  safety?: {
    checked: boolean;
    safe: boolean;
    threatType?: string;
    confidence?: number;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, model = 'gpt-4' }: ChatRequest = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages required' });
  }

  try {
    // Wait for detector to be ready
    if (!initialized) {
      await detector.initialize();
      initialized = true;
    }

    // Process each message
    for (const message of messages) {
      if (typeof message.content !== 'string') continue;

      // Sanitize
      const sanitized = sanitizer.sanitize(message.content);
      message.content = sanitized.sanitized;

      // Detect threats
      const detection = await detector.detect(message.content, {
        role: message.role,
        model
      });

      if (detection.isMalicious) {
        // Log the attempt
        console.warn('Prompt injection blocked:', {
          threatType: detection.threatType,
          confidence: detection.confidence,
          timestamp: new Date().toISOString()
        });

        return res.status(400).json({
          error: 'Request blocked due to security concerns',
          safety: {
            checked: true,
            safe: false,
            threatType: detection.threatType,
            confidence: detection.confidence
          }
        });
      }
    }

    // Call your LLM API here
    const llmResponse = await callLLM(messages, model);

    // Filter output
    const filterResult = filter.filterOutput(llmResponse);

    if (!filterResult.allowed) {
      return res.status(400).json({
        error: 'Response blocked due to safety concerns',
        safety: {
          checked: true,
          safe: false
        }
      });
    }

    res.status(200).json({
      response: filterResult.output || llmResponse,
      safety: {
        checked: true,
        safe: true
      }
    });

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({
      error: 'Internal server error',
      safety: {
        checked: false,
        safe: false
      }
    });
  }
}

async function callLLM(messages: unknown[], model: string): Promise<string> {
  // Implement your LLM call here
  // Example with OpenAI:
  /*
  const { OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  const response = await openai.chat.completions.create({
    model,
    messages,
  });
  
  return response.choices[0].message.content || '';
  */
  
  return "Placeholder LLM response";
}

// App Router version (app/api/chat/route.ts)
/*
import { NextRequest, NextResponse } from 'next/server';
import { PromptArmor } from 'prompt-armor';

const armor = new PromptArmor();

export async function POST(request: NextRequest) {
  const { messages } = await request.json();
  
  // Check input
  for (const message of messages) {
    const check = await armor.protect(message.content);
    
    if (!check.safe) {
      return NextResponse.json(
        { error: 'Blocked: ' + check.detection?.threatType },
        { status: 400 }
      );
    }
  }
  
  // Process with LLM
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages, model: 'gpt-4' })
  });
  
  const data = await response.json();
  
  // Filter output
  const outputCheck = await armor.checkOutput(data.choices[0].message.content);
  
  if (!outputCheck.allowed) {
    return NextResponse.json(
      { error: 'Response filtered' },
      { status: 400 }
    );
  }
  
  return NextResponse.json({ response: outputCheck.filtered });
}
*/
