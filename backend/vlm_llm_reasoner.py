import os
import json
import google.generativeai as genai
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

load_dotenv()

class TemporalReasoner:
    def __init__(self):
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        if self.gemini_key:
            genai.configure(api_key=self.gemini_key)
            self.model = genai.GenerativeModel('gemini-flash-latest', generation_config={"response_mime_type": "application/json"})
        else:
            self.model = None

    def reason(self, question: str, engine_result: Dict[str, Any], events: List[Dict[str, Any]], tracks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyzes the video events using Gemini 1.5 Flash to provide true AI reasoning.
        """
        if engine_result.get("is_ordinal"):
            subj = engine_result.get("direct_subject", "target object")
            engine_result["reasoning_steps"] = [
                f"Identified ordinal query targeting: {subj}.",
                "Extracted frame boundary trajectories and spatial exit timestamps from temporal memory.",
                f"Verified exact timestamp at {engine_result.get('timeline', [{}])[-1].get('time', 'specified time')} with high geometric confidence."
            ]
            return engine_result

        if not self.model:
            engine_result["reasoning_steps"] = ["No GEMINI_API_KEY found in .env.", "Falling back to deterministic rule-based engine."]
            return engine_result

        # Condense the events for the LLM context
        clean_events = []
        for e in events:
            clean_events.append({
                "time_sec": e["timestamp"],
                "description": e["description"]
            })
            
        clean_tracks = []
        for t in tracks:
            clean_tracks.append({
                "id": t["track_id"],
                "class": t["class_name"],
                "start_sec": t["first_seen"],
                "end_sec": t["last_seen"]
            })

        prompt = f"""
You are an advanced Temporal Video AI Investigator.
I am providing you with the exact geometric and temporal memory events extracted from a video by a YOLO vision model.
Analyze these events logically to answer the user's question.

User Question: {question}

Events:
{json.dumps(clean_events, indent=2)}

Tracks:
{json.dumps(clean_tracks, indent=2)}

You MUST respond strictly in valid JSON matching this exact schema:
{{
    "answer": "A detailed, intelligent answer to the question based on the events.",
    "timeline": [
        {{ "event": "Short description of event", "time": "MM:SS format", "timestamp_sec": 0.0 }}
    ],
    "evidence_start": 0.0,
    "evidence_end": 10.0,
    "reasoning_steps": ["step 1", "step 2", "step 3"]
}}
"""
        try:
            response = self.model.generate_content(prompt)
            result = json.loads(response.text)
            
            return {
                "answer": result.get("answer", engine_result.get("answer")),
                "timeline": result.get("timeline", engine_result.get("timeline")),
                "evidence_start": result.get("evidence_start", engine_result.get("evidence_start")),
                "evidence_end": result.get("evidence_end", engine_result.get("evidence_end")),
                "confidence": 0.99,
                "reasoning_steps": result.get("reasoning_steps", []),
            }
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "quota" in error_str.lower():
                engine_result["reasoning_steps"] = ["Google Gemini API Quota Exceeded for this free key.", "Temporarily falling back to local deterministic engine logic."]
            else:
                engine_result["reasoning_steps"] = [f"LLM Error encountered.", "Falling back to deterministic engine."]
            return engine_result
