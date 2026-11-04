import subprocess
import time
import re

# Read 50 lines from jujutsu_02_subs_dialogue.ass
with open('/tmp/notdedsec_jjk/02/jujutsu_02_subs_dialogue.ass', 'r', encoding='utf-8') as f:
    raw_lines = [l.strip() for l in f if l.startswith('Dialogue:')]

sample = raw_lines[:50]
items = []
for i, line in enumerate(sample):
    parts = line.split(',', 9)
    speaker = parts[4]
    text = parts[9]
    items.append(f"{i}|{speaker}|{text}")

chunk_txt = "\n".join(items)

prompt = """Você é um mestre de tradução e localização oficial de anime Jujutsu Kaisen para Português do Brasil (PT-BR).
Traduza as falas abaixo levando em consideração o falante (Speaker), o contexto narrativo do episódio, o tom do personagem e o vocabulário canônico (Feiticeiros Jujutsu, Energia Amaldiçoada, Maldições, Expansão de Domínio, etc.).
Preserve TODAS as tags de estilo e formatação ASS (como {\\i1}, {\\i0}, {\\an8}, \\N, etc.).
Mantenha rigorosamente o formato 'ID|TextoTraduzido', uma linha por ID, do 0 até o """ + str(len(sample)-1) + """. Não pule nenhuma linha nem adicione explicações.

Falas:
""" + chunk_txt

t0 = time.time()
res = subprocess.run(['/home/hokyozu/.local/bin/agy', '--model', 'gemini-3.8-flash-low', '-p', prompt], capture_output=True, text=True)
lines = [l for l in res.stdout.strip().split('\n') if '|' in l and l.split('|')[0].strip().isdigit()]
print(f"Time: {time.time()-t0:.2f}s")
print(f"Received lines: {len(lines)} of {len(sample)}")
print("First 5 translated:")
for l in lines[:5]:
    print(" ", l)
print("Last 5 translated:")
for l in lines[-5:]:
    print(" ", l)
