/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Chat } from '@google/genai';

// --- DOM Elements ---
const loginView = document.getElementById('login-view')!;
const chatView = document.getElementById('chat-view')!;
const loginButton = document.getElementById('login-button') as HTMLButtonElement;
const apiKeyError = document.getElementById('api-key-error')!;
const chatContainer = document.getElementById('chat-container')!;
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const micButton = document.getElementById('mic-button') as HTMLButtonElement;

// Store original icons for toggling
const micIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>`;
const micStopIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect width="10" height="10" x="7" y="7" rx="1"></rect></svg>`;

// --- App State ---
let ai: GoogleGenAI;
let chat: Chat | null = null;
let isListening = false;
let recognition: any | null = null;

// --- App Initialization ---

/**
 * Checks for API key and initializes the app.
 */
function initializeApp() {
    if (!process.env.API_KEY) {
        loginButton.disabled = true;
        apiKeyError.textContent = 'API Key is missing. Please set the API_KEY environment variable in your deployment secrets.';
        apiKeyError.classList.remove('hidden');
        console.error("API Key not found.");
        return;
    }
    
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    setupSpeechRecognition();
    addEventListeners();
}

// --- Speech Recognition Setup ---
function setupSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim();
            if (transcript) {
                promptInput.value = transcript;
                sendMessage(transcript);
            }
        };

        recognition.onstart = () => {
            isListening = true;
            micButton.classList.add('listening');
            micButton.innerHTML = micStopIconSVG; 
        };

        recognition.onend = () => {
            isListening = false;
            micButton.classList.remove('listening');
            micButton.innerHTML = micIconSVG;
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                alert('Microphone access was denied. To use voice input, please enable microphone permissions for this site in your browser settings.');
            } else {
                alert(`An error occurred with voice recognition: ${event.error}`);
            }
            if (isListening) {
                recognition?.stop();
            }
        };
    } else {
        micButton.style.display = 'none';
        console.warn('Speech Recognition API not supported in this browser.');
    }
}


// --- Main App Logic ---

/**
 * Initializes the chat session with Gemini.
 */
function initializeChat() {
    chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: 'You are a futuristic, highly intelligent AI assistant. Your personality is sleek, efficient, and insightful. Your responses are concise but informative. You are built into a beautiful, modern interface.',
        },
    });
}

/**
 * Creates an avatar element.
 * @param {string} sender - 'user' or 'assistant'.
 * @returns {HTMLElement} The avatar element.
 */
function createAvatar(sender: 'user' | 'assistant'): HTMLElement {
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    
    const userSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    const assistantSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8" /><rect x="4" y="12" width="16" height="8" rx="2" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M12 18v-2" /></svg>`;

    avatar.innerHTML = sender === 'user' ? userSVG : assistantSVG;
    return avatar;
}

/**
 * Creates and appends a message element to the chat container.
 * @param {string} sender - 'user' or 'assistant'.
 * @param {string} [message] - The message content (optional).
 * @returns {HTMLElement} The message bubble element that was created.
 */
function addMessage(sender: 'user' | 'assistant', message?: string): HTMLElement {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    
    const avatar = createAvatar(sender);
    
    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    
    if (message) {
        bubble.textContent = message;
    }

    messageElement.appendChild(avatar);
    messageElement.appendChild(bubble);
    chatContainer.appendChild(messageElement);

    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return bubble;
}

/**
 * Shows the typing indicator in a new assistant message bubble.
 * @returns {HTMLElement} The bubble element containing the indicator.
 */
function showTypingIndicator(): HTMLElement {
    const assistantBubble = addMessage('assistant');
    assistantBubble.classList.add('loading');

    const indicator = document.createElement('div');
    indicator.classList.add('typing-indicator');
    indicator.innerHTML = '<span></span><span></span><span></span>';
    assistantBubble.appendChild(indicator);
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return assistantBubble;
}

/**
 * Generates the initial greeting from the AI.
 */
async function generateInitialGreeting() {
    promptInput.disabled = true;
    sendButton.disabled = true;
    micButton.disabled = true;

    const assistantBubble = showTypingIndicator();
    
    try {
        const greetingPrompt = "Generate a short, friendly, futuristic-sounding greeting to start our conversation.";
        const responseStream = await chat!.sendMessageStream({ message: greetingPrompt });

        let fullResponse = '';
        assistantBubble.innerHTML = '';
        assistantBubble.classList.remove('loading');
        
        for await (const chunk of responseStream) {
            fullResponse += chunk.text;
            assistantBubble.textContent = fullResponse;
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    } catch (error) {
        console.error('Error generating initial greeting:', error);
        assistantBubble.textContent = 'An error occurred while contacting the assistant. Please check the console for details.';
        assistantBubble.classList.add('error');
    } finally {
        promptInput.disabled = false;
        sendButton.disabled = false;
        micButton.disabled = false;
        promptInput.focus();
    }
}


/**
 * Handles sending the user's message to the Gemini API and streaming the response.
 * @param {string} userMessage - The message from the user.
 */
async function sendMessage(userMessage: string) {
    if (!userMessage.trim() || sendButton.disabled) return;

    addMessage('user', userMessage);
    promptInput.value = '';
    promptInput.disabled = true;
    sendButton.disabled = true;
    micButton.disabled = true;

    const assistantBubble = showTypingIndicator();
    
    try {
        if (!chat) {
            initializeChat();
        }
        
        const responseStream = await chat!.sendMessageStream({ message: userMessage });

        let fullResponse = '';
        assistantBubble.innerHTML = '';
        assistantBubble.classList.remove('loading');
        
        for await (const chunk of responseStream) {
            fullResponse += chunk.text;
            assistantBubble.textContent = fullResponse;
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    } catch (error) {
        console.error('Error sending message to Gemini:', error);
        assistantBubble.textContent = 'An error occurred while contacting the assistant. Please check the console for details.';
        assistantBubble.classList.add('error');
    } finally {
        promptInput.disabled = false;
        sendButton.disabled = false;
        micButton.disabled = false;
        promptInput.focus();
    }
}

// --- Event Listeners ---

function addEventListeners() {
    loginButton.addEventListener('click', () => {
        loginView.classList.remove('is-active');
        chatView.classList.add('is-active');
        
        initializeChat();
        
        // Use a timeout to allow the view transition to complete before generating the greeting
        setTimeout(() => {
            generateInitialGreeting();
        }, 500);
    });

    function handleFormSubmit(e?: Event) {
        e?.preventDefault();
        const userMessage = promptInput.value;
        sendMessage(userMessage);
    }

    sendButton.addEventListener('click', handleFormSubmit);
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleFormSubmit();
        }
    });

    micButton.addEventListener('click', () => {
        if (!recognition || micButton.disabled) return;

        if (isListening) {
            recognition.stop();
        } else {
            try {
                recognition.start();
            } catch(e) {
                console.error("Could not start recognition", e);
                alert("Failed to start voice recognition. It might be already active or an issue occurred.");
                // Manually reset state if start fails
                isListening = false;
                micButton.classList.remove('listening');
                micButton.innerHTML = micIconSVG;
            }
        }
    });
}

// --- Start the app ---
initializeApp();