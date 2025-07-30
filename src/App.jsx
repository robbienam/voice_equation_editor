import React, { useState, useEffect, useRef } from 'react';

// Helper component for rendering LaTeX
const MathJax = ({ tex }) => {
    const [svg, setSvg] = useState('');

    useEffect(() => {
        if (window.MathJax && tex) {
            // Correctly wrap the TeX string with delimiters for MathJax
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
    const [isMathJaxReady, setIsMathJaxReady] = useState(false);
    const recognitionRef = useRef(null);
    const speechTargetRef = useRef(null); 

    // Load MathJax script and set a ready flag
    useEffect(() => {
        window.MathJax = {
            tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
            svg: { fontCache: 'global' },
            startup: {
                ready: () => {
                    window.MathJax.startup.defaultReady();
                    setIsMathJaxReady(true);
                }
            }
        };

        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
        script.id = "mathjax-script";
        script.async = true;
        document.head.appendChild(script);

        return () => {
            const scriptTag = document.getElementById('mathjax-script');
            if (scriptTag) document.head.removeChild(scriptTag);
        };
    }, []);

    // Setup Speech Recognition
    useEffect(() => {
        try {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                console.warn("Speech Recognition not supported in this browser.");
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
        } catch (error) {
            console.error("Failed to initialize Speech Recognition:", error);
        }

    }, []);

    const toggleListening = (target) => {
        if (recognitionRef.current) {
            if (isListening) {
                recognitionRef.current?.stop();
                setIsListening(false);
            } else {
                speechTargetRef.current = target;
                recognitionRef.current?.start();
                setIsListening(true);
            }
        } else {
            const alertBox = document.createElement('div');
            alertBox.style.position = 'fixed';
            alertBox.style.top = '20px';
            alertBox.style.left = '50%';
            alertBox.style.transform = 'translateX(-50%)';
            alertBox.style.padding = '16px';
            alertBox.style.background = '#f44336';
            alertBox.style.color = 'white';
            alertBox.style.borderRadius = '8px';
            alertBox.style.zIndex = '1000';
            alertBox.innerText = "Speech recognition is not available on this browser.";
            document.body.appendChild(alertBox);
            setTimeout(() => {
                document.body.removeChild(alertBox);
            }, 3000);
        }
    };

    const cleanEquation = (equationText) => {
        let cleaned = equationText.trim();
        cleaned = cleaned.replace(/^\\?\(|^\$/, '').replace(/\\?\)$|\$$/, '');
        return cleaned.trim();
    };

    // This function now calls our secure Netlify function proxy
    const callGeminiProxy = async (prompt) => {
        const response = await fetch('/.netlify/functions/gemini-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Proxy call failed with status: ${response.status}. Body: ${errorText}`);
        }

        return response.json();
    };

    const handleStartEquation = async (e) => {
        e.preventDefault();
        if (!newEquation.trim() || isLoading) return;

        setIsLoading(true);
        const initialUserCommand = newEquation; // Capture the user's command
        const prompt = `You are a helpful math assistant. Your task is to convert a natural language sentence describing a mathematical equation into a valid LaTeX format.
        Sentence: "${initialUserCommand}"
        Return ONLY the resulting equation in valid LaTeX format. Do not include any explanation, text, or enclosing characters like '$'. For example, if the sentence is "x squared plus y squared equals r squared", return "x^2 + y^2 = r^2".`;

        try {
            const result = await callGeminiProxy(prompt);
            
            if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts.length > 0) {
                 const rawEquationText = result.candidates[0].content.parts[0].text;
                 const finalEquation = cleanEquation(rawEquationText);
                 // Use the captured user command instead of "Given"
                 setSteps([{ equation: finalEquation, command: initialUserCommand }]);
            } else {
                 setSteps([{ equation: "Error: Could not convert. Please type.", command: initialUserCommand }]);
            }

        } catch (error) {
            console.error("Error calling proxy function:", error);
            setSteps([{ equation: "Error: Could not convert. Please type.", command: initialUserCommand }]);
        } finally {
            setNewEquation('');
            setIsLoading(false);
        }
    };

    const handleUndo = () => {
        // We can only undo if there is more than one step in the history.
        if (steps.length > 1) {
            setSteps(steps.slice(0, -1));
        }
    };

    const handleNewStep = async (e) => {
        e.preventDefault();
        const command = newCommand.trim().toLowerCase();
        if (!command || isLoading) return;

        // Check for the "undo" command before making an API call.
        if (command.includes('undo')) {
            handleUndo();
            setNewCommand(''); // Clear the input field
            return; // Stop the function here
        }

        setIsLoading(true);
        const lastEquation = steps[steps.length - 1].equation;

        const prompt = `You are a helpful math assistant. Your task is to perform an algebraic manipulation on a given LaTeX equation based on a natural language command.
        Previous equation: "${lastEquation}"
        Command: "${newCommand}"
        Return ONLY the resulting new equation in valid LaTeX format. Do not include any explanation, text, or enclosing characters like '$'. For example, if the result is 'x=5', return exactly that.`;

        try {
            const result = await callGeminiProxy(prompt);
            
            if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts.length > 0) {
                 const rawEquationText = result.candidates[0].content.parts[0].text;
                 const finalEquation = cleanEquation(rawEquationText);
                 setSteps([...steps, { equation: finalEquation, command: newCommand }]);
            } else {
                 setSteps([...steps, { equation: "Error: Could not compute. Please edit.", command: newCommand }]);
            }

        } catch (error) {
            console.error("Error calling proxy function:", error);
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
                                <button type="button" onClick={() => toggleListening('initial')} className={`absolute inset-y-0 right-0 flex items-center px-3 rounded-r-lg transition-colors ${isListening && speechTargetRef.current === 'initial' ? 'text-cyan-400 bg-gray-600' : 'text-gray-400 hover:text-white'}`} disabled={isLoading}>
                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8h-1a6 6 0 11-12 0H3a7.001 7.001 0 006 6.93V17H7v1h6v-1h-2v-2.07z" clipRule="evenodd"></path></svg>
                                </button>
                            </div>
                            <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105 shadow-lg w-full sm:w-auto disabled:bg-gray-500 disabled:cursor-not-allowed" disabled={isLoading}>
                                {isLoading ? 'Starting...' : 'Start'}
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <form onSubmit={handleNewStep} className="flex flex-col sm:flex-row items-center gap-4">
                               <div className="relative flex-grow w-full">
                                    <input
                                        type="text"
                                        value={newCommand}
                                        onChange={(e) => setNewCommand(e.target.value)}
                                        placeholder={isListening && speechTargetRef.current === 'command' ? "Listening..." : "Enter or speak your next command"}
                                        className="w-full bg-gray-700 text-white placeholder-gray-500 rounded-lg pl-4 pr-12 py-3 border border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:outline-none transition"
                                        disabled={isLoading}
                                    />
                                    <button type="button" onClick={() => toggleListening('command')} className={`absolute inset-y-0 right-0 flex items-center px-3 rounded-r-lg transition-colors ${isListening && speechTargetRef.current === 'command' ? 'text-cyan-400 bg-gray-600' : 'text-gray-400 hover:text-white'}`} disabled={isLoading}>
                                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8h-1a6 6 0 11-12 0H3a7.001 7.001 0 006 6.93V17H7v1h6v-1h-2v-2.07z" clipRule="evenodd"></path></svg>
                                    </button>
                               </div>
                                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105 shadow-lg w-full sm:w-auto disabled:bg-gray-500 disabled:cursor-not-allowed" disabled={isLoading}>
                                    {isLoading ? 'Thinking...' : 'Add Step'}
                                </button>
                            </form>
                            <div className="pt-2 text-center flex justify-center gap-4">
                                <button onClick={handleUndo} className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-5 rounded-lg transition-colors shadow-md transform hover:scale-105 disabled:bg-gray-500 disabled:cursor-not-allowed" disabled={steps.length <= 1}>
                                    Undo Last Step
                                </button>
                                <button onClick={handleStartOver} className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-5 rounded-lg transition-colors shadow-md transform hover:scale-105">
                                    Start Over
                                </button>
                            </div>
                        </div>
                    )}

                    {steps.length > 0 && (
                        <div className="mt-8 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr>
                                        <th className="border-b-2 border-gray-600 p-4 text-lg text-cyan-400 w-16 text-center">#</th>
                                        <th className="border-b-2 border-gray-600 p-4 text-lg text-cyan-400">Equation (Editable)</th>
                                        <th className="border-b-2 border-gray-600 p-4 text-lg text-cyan-400">Command</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {steps.map((step, index) => (
                                        <tr key={index} className="border-t border-gray-700 hover:bg-gray-700/50">
                                            <td className="p-4 text-gray-400 align-middle text-lg font-bold text-center">{index + 1}</td>
                                            <td className="p-4 align-top">
                                                <input 
                                                    type="text"
                                                    value={step.equation}
                                                    onChange={(e) => handleEquationEdit(index, e.target.value)}
                                                    className="w-full bg-transparent text-lg text-white focus:outline-none focus:bg-gray-600 rounded px-2 py-1 mb-2"
                                                />
                                                <div className="min-h-[60px] flex items-center justify-center">
                                                    <MathJax tex={step.equation} />
                                                 </div>
                                            </td>
                                            <td className="p-4 text-gray-300 align-middle text-lg">
                                                {step.command}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                 <footer className="text-center mt-8 text-gray-500 text-sm">
                    <p>Powered by Gemini, React, & MathJax</p>
                </footer>
            </div>
        </div>
    );
}
