import React, { useState, useEffect, useRef } from 'react';

// Helper component for rendering LaTeX
const MathJax = ({ tex }) => {
    const [svg, setSvg] = useState('');

    useEffect(() => {
        if (window.MathJax && tex) {
            // This function correctly adds the delimiters for rendering only.
            window.MathJax.tex2svgPromise(`\\(${tex}\\)`)
                .then((node) => {
                    const svgElement = node.querySelector('svg');
                    if (svgElement) {
                        svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                        svgElement.style.width = '100%';
                        svgElement.style.height = 'auto';
                        svgElement.style.maxWidth = '400px';
                        svgElement.style.verticalAlign = 'middle';
                        Array.from(svgElement.getElementsByTagName('g')).forEach(g => {
                             g.setAttribute('fill', 'currentColor');
                        });
                        setSvg(svgElement.outerHTML);
                    }
                })
                .catch((err) => console.error('MathJax rendering error:', err));
        } else {
            setSvg('');
        }
    }, [tex]);

    if (!svg) {
        return <div className="p-4 min-h-[60px]"></div>;
    }

    return <div className="flex items-center justify-center h-full" dangerouslySetInnerHTML={{ __html: svg }} />;
};


// Main App Component
export default function App() {
    const [steps, setSteps] = useState([]);
    const [newCommand, setNewCommand] = useState('');
    const [newEquation, setNewEquation] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isMathJaxReady, setIsMathJaxReady] = useState(false); // New state to track MathJax
    const recognitionRef = useRef(null);
    const speechTargetRef = useRef(null); 

    // Load MathJax script and set a ready flag
    useEffect(() => {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
        script.id = "mathjax-script";
        script.async = true;
        
        // Set the ready flag once the script has loaded
        script.onload = () => {
            window.MathJax = {
                tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
                svg: { fontCache: 'global' }
            };
            setIsMathJaxReady(true);
        };
        
        document.head.appendChild(script);

        return () => {
            const scriptTag = document.getElementById('mathjax-script');
            if (scriptTag) document.head.removeChild(scriptTag);
        };
    }, []);

    // Setup Speech Recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error("Speech Recognition not supported in this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (speechTargetRef.current === 'initial') {
                setNewEquation(transcript);
            } else if (speechTargetRef.current === 'command') {
                setNewCommand(transcript);
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            setIsListening(false);
        };
        
        recognition.onend = () => {
            setIsListening(false);
            speechTargetRef.current = null;
        };

        recognitionRef.current = recognition;

    }, []);

    const toggleListening = (target) => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            speechTargetRef.current = target;
            recognitionRef.current?.start();
            setIsListening(true);
        }
    };

    // More robust function to clean delimiters from AI response
    const cleanEquation = (equationText) => {
        let cleaned = equationText.trim();
        cleaned = cleaned.replace(/^\\?\(|^\$/, '').replace(/\\?\)$|\$$/, '');
        return cleaned.trim();
    };

    const handleStartEquation = async (e) => {
        e.preventDefault();
        if (!newEquation.trim() || isLoading) return;

        setIsLoading(true);
        const prompt = `You are a helpful math assistant. Your task is to convert a natural language sentence describing a mathematical equation into a valid LaTeX format.
        Sentence: "${newEquation}"
        Return ONLY the resulting equation in valid LaTeX format. Do not include any explanation, text, or enclosing characters like '$'. For example, if the sentence is "x squared plus y squared equals r squared", return "x^2 + y^2 = r^2".`;

        try {
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);
            
            const result = await response.json();
            
            if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts.length > 0) {
                 const rawEquationText = result.candidates[0].content.parts[0].text;
                 const finalEquation = cleanEquation(rawEquationText);
                 setSteps([{ equation: finalEquation, command: 'Given' }]);
            } else {
                 setSteps([{ equation: "Error: Could not convert. Please type.", command: 'Given' }]);
            }

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            setSteps([{ equation: "Error: Could not convert. Please type.", command: 'Given' }]);
        } finally {
            setNewEquation('');
            setIsLoading(false);
        }
    };

    const handleNewStep = async (e) => {
        e.preventDefault();
        if (!newCommand.trim() || isLoading) return;

        setIsLoading(true);
        const lastEquation = steps[steps.length - 1].equation;

        const prompt = `You are a helpful math assistant. Your task is to perform an algebraic manipulation on a given LaTeX equation based on a natural language command.
        Previous equation: "${lastEquation}"
        Command: "${newCommand}"
        Return ONLY the resulting new equation in valid LaTeX format. Do not include any explanation, text, or enclosing characters like '$'. For example, if the result is 'x=5', return exactly that.`;

        try {
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }] };
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);

            const result = await response.json();
            
            if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts.length > 0) {
                 const rawEquationText = result.candidates[0].content.parts[0].text;
                 const finalEquation = cleanEquation(rawEquationText);
                 setSteps([...steps, { equation: finalEquation, command: newCommand }]);
            } else {
                 setSteps([...steps, { equation: "Error: Could not compute. Please edit.", command: newCommand }]);
            }

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            setSteps([...steps, { equation: "Error: Could not compute. Please edit.", command: newCommand }]);
        } finally {
            setNewCommand('');
            setIsLoading(false);
        }
    };
    
    const handleEquationEdit = (index, text) => {
        const updatedSteps = [...steps];
        updatedSteps[index].equation = text;
        setSteps(updatedSteps);
    };

    const handleStartOver = () => {
        setSteps([]);
        setNewCommand('');
        setNewEquation('');
    };

    // Show a loading indicator until MathJax is ready
    if (!isMathJaxReady) {
        return (
            <div className="bg-gray-900 text-white min-h-screen p-8 flex items-center justify-center">
                <h1 className="text-2xl text-cyan-400">Loading Equation Editor...</h1>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen p-4 sm:p-6 lg:p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-3xl sm:text-4xl font-bold text-cyan-400">AI-Powered Equation Editor</h1>
                    <p className="text-gray-400 mt-2">Use your voice to dictate commands and watch the AI create or manipulate a math expression.</p>
                </header>

                <div className="bg-gray-800 shadow-2xl rounded-xl p-6">
                    {steps.length === 0 ? (
                        <form onSubmit={handleStartEquation} className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="relative flex-grow w-full">
                                <input
                                    type="text"
                                    value={newEquation}
                                    onChange={(e) => setNewEquation(e.target.value)}
                                    placeholder={isListening && speechTargetRef.current === 'initial' ? "Listening..." : "Enter or speak initial equation"}
                                    className="w-full bg-gray-700 text-white placeholder-gray-500 rounded-lg pl-4 pr-12 py-3 border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition"
                                    disabled={isLoading}
                                />
                                <button type="button" onClick={() => toggleListening('initial