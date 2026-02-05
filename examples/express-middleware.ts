import express, { Request, Response, NextFunction } from 'express';
import { PromptArmorGenericAdapter } from 'prompt-armor';

const app = express();
app.use(express.json());

// Initialize Prompt Armor
const armor = new PromptArmorGenericAdapter({
  blockOnDetection: true,
  sanitizeInput: true,
  filterOutput: true,
  onDetection: (result, input) => {
    console.warn('🛡️ Threat detected:', {
      type: result.threatType,
      confidence: result.confidence,
      input: input
    });
  }
});

// Initialize the detector (load ML model if enabled)
armor.initialize().then(() => {
  console.log('✅ Prompt Armor initialized');
});

// Apply middleware to all routes
app.use(armor.expressMiddleware());

// Or apply to specific routes
app.post('/api/chat', async (req: Request, res: Response) => {
  // This route is now protected by Prompt Armor
  const { messages } = req.body;
  
  // Your LLM integration here
  const response = await callYourLLM(messages);
  
  res.json({ response });
});

// Example with custom handling
app.post('/api/chat/lenient', async (req: Request, res: Response) => {
  const { messages } = req.body;
  
  // Check but don't block - let through with warning
  const check = await armor.checkInput({ messages });
  
  if (!check.safe) {
    // Log but still process
    console.warn('Suspicious input detected but allowing:', check.detection);
    res.setHeader('X-Prompt-Armor-Warning', 'suspicious-input-detected');
  }
  
  const response = await callYourLLM(check.sanitized.messages);
  
  // Filter output
  const filter = armor.filterOutput({ content: response });
  
  res.json({ 
    response: filter.filtered,
    safety: {
      inputChecked: true,
      inputSafe: check.safe,
      outputFiltered: filter.filterResult?.wasFiltered
    }
  });
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    promptArmor: 'active'
  });
});

async function callYourLLM(messages: unknown[]): Promise<string> {
  // Your LLM call implementation
  return "This is a placeholder response";
}

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
