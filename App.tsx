
import React, { useState, useCallback, useMemo } from 'react';
import { FORM_STEPS } from './constants';
import { type FormData, type ParsedOutput } from './types';
import { generateMetaPrompt } from './services/geminiService';
import Step from './components/Step';
import Preview from './components/Preview';
import { LoaderIcon } from './components/icons';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(() => {
    const initialState: FormData = {};
    FORM_STEPS.forEach(step => {
      step.fields.forEach(field => {
        if (field.type === 'checkbox') {
          initialState[field.id] = [];
        } else {
          initialState[field.id] = field.default ?? '';
        }
      });
    });
    return initialState;
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ParsedOutput | null>(null);

  const handleFormChange = useCallback((id: string, value: any) => {
    setFormData(prev => ({ ...prev, [id]: value }));
  }, []);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    setOutput(null);
    try {
      const result = await generateMetaPrompt(formData);
      setOutput(result);
      setCurrentStep(FORM_STEPS.length); // Move to result view
    } catch (e: any) {
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const isLastStep = currentStep === FORM_STEPS.length - 1;

  const progressPercentage = useMemo(() => {
    if (output) return 100;
    return ((currentStep + 1) / (FORM_STEPS.length + 1)) * 100;
  }, [currentStep, output]);

  const startOver = () => {
    setCurrentStep(0);
    setOutput(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-8 font-sans">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
            Meta-Prompt Generator
          </h1>
          <p className="text-gray-400 mt-2">Buat prompt AI canggih sesuai kebutuhan Anda dengan mudah.</p>
        </header>

        <main className="bg-gray-800/50 rounded-2xl shadow-2xl shadow-indigo-900/20 p-6 sm:p-10 border border-gray-700">
          {/* Progress Bar */}
          <div className="mb-8">
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-indigo-600 bg-indigo-200">
                    {output ? 'Selesai' : `Langkah ${currentStep + 1} dari ${FORM_STEPS.length}`}
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-indigo-900/50">
                <div style={{ width: `${progressPercentage}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500 transition-all duration-500"></div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg relative mb-6" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          {output ? (
             <Preview data={output} />
          ) : (
            FORM_STEPS.map((step, index) => (
              <Step
                key={step.id}
                stepData={step}
                formData={formData}
                onFormChange={handleFormChange}
                isActive={currentStep === index}
              />
            ))
          )}

          <div className="mt-10 pt-6 border-t border-gray-700 flex justify-between items-center">
            {output ? (
              <button
                onClick={startOver}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition duration-300 disabled:opacity-50"
              >
                Buat Lagi
              </button>
            ) : (
              <>
                <button
                  onClick={() => setCurrentStep(s => Math.max(0, s - 1))}
                  disabled={currentStep === 0 || isLoading}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg transition duration-300 disabled:opacity-50"
                >
                  Kembali
                </button>
                
                {isLastStep ? (
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition duration-300 flex items-center space-x-2 disabled:opacity-50"
                  >
                    {isLoading && <LoaderIcon />}
                    <span>{isLoading ? 'Memproses...' : 'Buat Prompt'}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentStep(s => Math.min(FORM_STEPS.length - 1, s + 1))}
                    disabled={isLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition duration-300 disabled:opacity-50"
                  >
                    Lanjut
                  </button>
                )}
              </>
            )}
          </div>
        </main>
        <footer className="text-center mt-8 text-gray-500 text-sm">
          <p>Powered by Google Gemini & React</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
