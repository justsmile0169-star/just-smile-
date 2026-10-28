import asyncio
import os
import math
import struct
import wave
import edge_tts

OUTPUT_DIR = "videos/just-smile-reels/assets"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 1. Generate Voiceovers using Algerian Arabic Neural Voice
VOICE = "ar-DZ-IsmaelNeural"

SCENES_VO = [
    {
        "id": "vo_scene_1",
        "file": os.path.join(OUTPUT_DIR, "vo_scene1.mp3"),
        "text": "راك دونتيست ولا تسير عيادة أسنان في الجزائر؟ وشحال من مرة يخصوك دي كونسومابل ولا ماتريال، وتلقى روحك ضايع مع كثرة الموردين وتأخر التوصيل؟"
    },
    {
        "id": "vo_scene_2",
        "file": os.path.join(OUTPUT_DIR, "vo_scene2.mp3"),
        "text": "اليوم مع جاست سمايل كلش ولا ساهل وواضح! موقعكم الإلكتروني بي تو بي المعتمد لمستلزمات طب الأسنان بالجزائر في مكان واحد!"
    },
    {
        "id": "vo_scene_3",
        "file": os.path.join(OUTPUT_DIR, "vo_scene3.mp3"),
        "text": "ست فئات أساسية ومصنفة بدقة: إيكيبمون، كونسومابل، آنستريمون، أورطودونسي، إيجيان إي ستيريليزاسيون، وبروتيز دونتير.. جودة مضمونة وبأسعار تنافسية وعروض حصرية تلقاوها كامل على الموقع!"
    },
    {
        "id": "vo_scene_4",
        "file": os.path.join(OUTPUT_DIR, "vo_scene4.mp3"),
        "text": "وين ما كان الكابيني تاعك، التوصيل سريع وموثوق يغطي كامل الـ تسعة وستين ولاية! لباب العيادة أو لمكتب التوصيل، مع توصيل مجاني لبلدية الجلفة، وتتبع مباشر لطلبك خطوة بخطوة."
    },
    {
        "id": "vo_scene_5",
        "file": os.path.join(OUTPUT_DIR, "vo_scene5.mp3"),
        "text": "ادخل للموقع في أي وقت، تصفح، كليكي وفاليدي لاكوموند، وتيليشارجي لي فاكتور دياولك بكل شفافية وراحة بال تساعدك تطور عيادتك بكل ثقة."
    },
    {
        "id": "vo_scene_6",
        "file": os.path.join(OUTPUT_DIR, "vo_scene6.mp3"),
        "text": "واش راك تستنى يا دكتور؟ ربح وقتك وطور عيادتك اليوم! زوروا موقعنا وسجلوا حسابكم الآن مجاناً.. جاست سمايل.. الابتسامة تبدأ من احترافيتكم!"
    }
]

async def generate_voiceovers():
    print("Generating Algerian voiceovers with edge-tts...")
    for item in SCENES_VO:
        print(f"Generating {item['id']}...")
        communicate = edge_tts.Communicate(item["text"], VOICE, rate="+5%", pitch="+0Hz")
        await communicate.save(item["file"])
        print(f"Saved {item['file']}")

# 2. Synthesize High-Quality SFX (WAV)
def create_whoosh_wav(filename, duration=0.6, sample_rate=44100):
    num_samples = int(duration * sample_rate)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        
        frames = []
        for i in range(num_samples):
            t = i / sample_rate
            # Frequency sweep from 150Hz to 600Hz down to 200Hz
            progress = t / duration
            env = math.sin(math.pi * progress) ** 1.8  # smooth in and out
            freq = 200 + 400 * math.sin(math.pi * progress)
            
            # White noise blend for breathy whoosh
            noise = (math.sin(i * 12.9898) * 43758.5453) % 1.0 - 0.5
            sine = math.sin(2 * math.pi * freq * t)
            sample = (sine * 0.7 + noise * 0.3) * env * 22000
            frames.append(struct.pack('<h', int(sample)))
        
        wav_file.writeframes(b''.join(frames))
    print(f"Created {filename}")

def create_pop_wav(filename, duration=0.15, sample_rate=44100):
    num_samples = int(duration * sample_rate)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        
        frames = []
        for i in range(num_samples):
            t = i / sample_rate
            env = math.exp(-25 * t)
            freq = 600 - 400 * (t / duration)
            sample = math.sin(2 * math.pi * freq * t) * env * 24000
            frames.append(struct.pack('<h', int(sample)))
            
        wav_file.writeframes(b''.join(frames))
    print(f"Created {filename}")

def create_chime_wav(filename, duration=1.2, sample_rate=44100):
    num_samples = int(duration * sample_rate)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        
        frames = []
        # Chime frequencies (C-major triad: 523Hz, 659Hz, 784Hz, 1046Hz)
        freqs = [523.25, 659.25, 783.99, 1046.50]
        for i in range(num_samples):
            t = i / sample_rate
            env = math.exp(-4 * t)
            sample = 0
            for f in freqs:
                sample += math.sin(2 * math.pi * f * t) * (0.25 * env)
            sample *= 26000
            frames.append(struct.pack('<h', int(sample)))
            
        wav_file.writeframes(b''.join(frames))
    print(f"Created {filename}")

if __name__ == "__main__":
    asyncio.run(generate_voiceovers())
    create_whoosh_wav(os.path.join(OUTPUT_DIR, "whoosh.wav"))
    create_pop_wav(os.path.join(OUTPUT_DIR, "pop.wav"))
    create_chime_wav(os.path.join(OUTPUT_DIR, "chime.wav"))
    print("All audio generated successfully!")
