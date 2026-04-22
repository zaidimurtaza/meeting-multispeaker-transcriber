import os
import time

import requests

api_key = os.environ.get("ASSEMBLYAI_API_KEY")
if not api_key:
    raise SystemExit("Set ASSEMBLYAI_API_KEY in the environment")

base_url = "https://api.assemblyai.com"

headers = {
    "authorization": api_key,
}

with open("./testaudio.mp3", "rb") as f:
    response = requests.post(base_url + "/v2/upload",
                             headers=headers,
                             data=f)

audio_url = response.json()["upload_url"]

data = {
    "audio_url": audio_url,
    "language_detection": True,
    "speech_models": ["universal-3-pro", "universal-2"],
    "speaker_labels": True
}

url = base_url + "/v2/transcript"
response = requests.post(url, json=data, headers=headers)

transcript_id = response.json()['id']
polling_endpoint = base_url + "/v2/transcript/" + transcript_id

while True:
    transcription_result = requests.get(polling_endpoint, headers=headers).json()

    if transcription_result['status'] == 'completed':

        print("\n===== CONVERSATION TRANSCRIPT =====\n")

        for utterance in transcription_result['utterances']:
            speaker   = utterance['speaker']
            text      = utterance['text']
            start_sec = round(utterance['start'] / 1000, 1)
            end_sec   = round(utterance['end']   / 1000, 1)

            print(f"Speaker {speaker}  |  {start_sec}s - {end_sec}s")
            print(f"{text}")
            print()

        break

    elif transcription_result['status'] == 'error':
        raise RuntimeError(f"Transcription failed: {transcription_result['error']}")

    else:
        time.sleep(3)
