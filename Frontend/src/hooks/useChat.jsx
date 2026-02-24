// Import React hooks and configuration
import { createContext, useContext, useEffect, useState } from "react";
import config from '../config/config.js';

// Get backend URL from configuration
const backendUrl = config.paths.backendUrl;

// Create chat context for global state management
const ChatContext = createContext();

/**
 * ChatProvider component to manage chat state and functionality
 * @param {Object} children - Child components
 * @returns {JSX.Element} Provider component with chat context
 */
export const ChatProvider = ({ children }) => {
  /**
   * Send message to backend and handle response
   * @param {string} message - User message to send
   */
  const chat = async (message) => {
    setLoading(true);
    const data = await fetch(`${backendUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
    const resp = (await data.json()).messages;
    setMessages((messages) => [...messages, ...resp]);
    setLoading(false);
  };
  
  // State management for chat functionality
  const [messages, setMessages] = useState([]); // Queue of messages to display
  const [message, setMessage] = useState(); // Current message being displayed
  const [loading, setLoading] = useState(false); // Loading state for API calls
  const [cameraZoomed, setCameraZoomed] = useState(true); // Camera zoom state
  
  /**
   * Remove played message from queue
   */
  const onMessagePlayed = () => {
    setMessages((messages) => messages.slice(1));
  };

  // Update current message when messages queue changes
  useEffect(() => {
    if (messages.length > 0) {
      setMessage(messages[0]);
    } else {
      setMessage(null);
    }
  }, [messages]);

  // Provide chat context to child components
  return (
    <ChatContext.Provider
      value={{
        chat,
        message,
        onMessagePlayed,
        loading,
        cameraZoomed,
        setCameraZoomed,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

/**
 * Custom hook to access chat context
 * @returns {Object} Chat context value
 * @throws {Error} If used outside ChatProvider
 */
export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
