#!/usr/bin/env python3
"""
Jujutsu Kaisen Contextual PT-BR Subtitle Translator
Uses Google Antigravity (agy CLI) with Gemini 3.8 Flash for high-fidelity,
lore-accurate, character-voiced anime localization.
"""

import os
import sys
import time
import subprocess
import re

SYSTEM_CONTEXT = """Você é o tradutor e diretor de localização oficial de anime de Jujutsu Kaisen para Português do Brasil (PT-BR).
Sua missão é traduzir as falas com a máxima fidelidade narrativa, fluidez natural brasileira e respeito absoluto ao universo da obra.

DIRETRIZES DE PERSONAGEM E TOM:
- Satoru Gojo: Muito confiante, descontraído, sarcástico, provocador e brincalhão com os alunos e superiores ("e aí", "foi mal aí", apelidos carinhosos), mas frio e aterrorizante quando luta a sério.
- Yuji Itadori: Fala jovem, expressivo, enérgico, direto, humilde, com gírias naturais de adolescente e imensa empatia.
- Megumi Fushiguro: Sério, reservado, analítico, fala com pragmatismo e certa frieza, sem rodeios.
- Nobara Kugisaki: Confiante, atrevida, cheia de orgulho de sua beleza e de suas raízes, pavio curto, impetuosa e impiedosa em combate.
- Ryomen Sukuna: Fala arcaica, intimidadora, sádica, zombeteira e de soberania absoluta. Trata humanos e maldições como vermes inferiores.
- Kento Nanami: Formal, cansado, metódico, vocabulário corporativo de ex-assalariado (horas extras, produtividade, dever de adulto).
- Aoi Todo: Dramático, exagerado, apaixonado pela Takada-chan, chama Yuji de "meu irmão" / "meu melhor amigo".
- Suguru Geto: Polido, voz mansa, elegante, mas com desprezo absoluto por não-feiticeiros ("macacos").
- Mahito: Infantil, travesso, curioso e cruelmente sádico com a fragilidade da alma humana.
- Toji Fushiguro: Despojado, cínico, desapegado, pragmático, sem lealdade a clãs ou ideais.

GLOSSÁRIO CANÔNICO OBRIGATÓRIO:
- Cursed Energy -> Energia Amaldiçoada
- Cursed Object -> Objeto Amaldiçoado (NUNCA use 'fetiche')
- Domain Expansion -> Expansão de Domínio
- Reverse Cursed Technique -> Técnica Amaldiçoada Reversa
- Cursed Spirits / Curses -> Maldições / Espíritos Amaldiçoados
- Jujutsu Sorcerer(s) -> Feiticeiro(s) Jujutsu
- Jujutsu High -> Escola Técnica Superior de Jujutsu (Escola Jujutsu)
- Black Flash -> Clarão Negro
- Divergent Fist -> Punho Divergente
- Malevolent Shrine -> Santuário Malevolente
- Unlimited Void -> Vazio Imensurável
- Chimera Shadow Garden -> Jardim das Sombras Quiméricas
- Self-Embodiment of Perfection -> Automanifestação da Perfeição
- Coffin of the Iron Mountain -> Caixão da Montanha de Ferro
- Idle Transfiguration -> Transfiguração Inerte
- Ratio Technique -> Técnica de Proporção
- Straw Doll Technique -> Técnica do Boneco de Palha (Resonance = Ressonância, Hairpin = Grampo)
- Limitless -> Ilimitado
- Infinity -> Infinito
- Blue / Lapse -> Azul / Convergência
- Red / Reversal -> Vermelho / Reversão
- Hollow Purple -> Roxo Vazio (Murasaki)
- Ten Shadows Technique -> Técnica das Dez Sombras
- Divine Dogs -> Cães Divinos
- Nue -> Nue
- Great Serpent -> Grande Serpente
- Toad -> Sapo (Gama)
- Max Elephant -> Elefante Máximo
- Rabbit Escape -> Fuga dos Coelhos
- Mahoraga -> General Divino Mahoraga
- Simple Domain -> Domínio Simples
- Falling Blossom Emotion -> Emoção da Flor Caída
- Curtain / Barrier -> Cortina ("Emerja da escuridão mais negra que o negro, purifique aquilo que é impuro.")
- Special Grade -> Grau Especial
- Finger Bearer -> Portador dos Dedos
- Death Painting Wombs -> Pinturas da Morte
- Culling Game -> Jogo do Abate
- Star Plasma Vessel -> Recipiente do Plasma Estelar
- Non-sorcerers -> Não-feiticeiros / Macacos (Geto)

REGRAS TÉCNICAS:
1. Mantenha intactas TODAS as tags ASS internas, como {\\i1}, {\\i0}, {\\an8}, {\\pos(...)}, \\N, {*...}, etc.
2. Não altere o ritmo nem adicione notas explicativas nas falas.
3. Responda estritamente no formato 'ID|TextoTraduzido', uma linha por ID, cobrindo todos os IDs solicitados.
"""

def translate_chunk(items, max_retries=3):
    """Translates a list of (id, speaker, text) tuples."""
    chunk_txt = "\n".join([f"{item[0]}|{item[1]}|{item[2]}" for item in items])
    expected_ids = {item[0] for item in items}
    min_id = min(expected_ids)
    max_id = max(expected_ids)

    prompt = (
        SYSTEM_CONTEXT +
        f"\nTraduza as {len(items)} falas a seguir do inglês para o Português do Brasil (PT-BR).\n"
        f"Mantenha rigorosamente o formato 'ID|TextoTraduzido' para todos os IDs de {min_id} até {max_id}.\n\n"
        f"Falas:\n{chunk_txt}"
    )

    for attempt in range(max_retries):
        try:
            res = subprocess.run(
                ['/home/hokyozu/.local/bin/agy', '--model', 'gemini-3.8-flash-low', '-p', prompt],
                capture_output=True,
                text=True,
                timeout=60
            )
            output = res.stdout.strip()
            translations = {}
            for line in output.split('\n'):
                line = line.strip()
                if '|' in line:
                    parts = line.split('|', 1)
                    if parts[0].strip().isdigit():
                        tid = int(parts[0].strip())
                        translations[tid] = parts[1].strip()

            missing = expected_ids - set(translations.keys())
            if not missing:
                return translations
            
            # If missing only a few, fill remaining with individual retry or fallback
            if len(missing) <= 3:
                print(f"  Missing {len(missing)} IDs, doing quick individual retry...")
                for mid in missing:
                    m_item = next(x for x in items if x[0] == mid)
                    p_single = (
                        SYSTEM_CONTEXT +
                        f"\nTraduza apenas esta fala mantendo o formato '{mid}|TextoTraduzido':\n"
                        f"{mid}|{m_item[1]}|{m_item[2]}"
                    )
                    r_single = subprocess.run(
                        ['/home/hokyozu/.local/bin/agy', '--model', 'gemini-3.8-flash-low', '-p', p_single],
                        capture_output=True, text=True, timeout=20
                    )
                    for sl in r_single.stdout.strip().split('\n'):
                        if '|' in sl and sl.split('|')[0].strip() == str(mid):
                            translations[mid] = sl.split('|', 1)[1].strip()
                            break
                    if mid not in translations:
                        # Fallback to original text if still missing
                        translations[mid] = m_item[2]
                return translations

            print(f"  Attempt {attempt+1}: missing {len(missing)} lines, retrying...")
            time.sleep(2)
        except Exception as e:
            print(f"  Error on attempt {attempt+1}: {e}")
            time.sleep(2)

    # Fallback to original text if all retries fail
    fallback = {}
    for item in items:
        fallback[item[0]] = item[2]
    return fallback


def translate_file(input_ass, output_ass, dialogue_only=False):
    """
    Translates an ASS subtitle file.
    If dialogue_only=True, every Dialogue event is considered a dialogue line.
    If dialogue_only=False, only Dialogue lines with dialogue styles (Default, Alt, Cursed)
    and without \\p1 drawings are translated.
    """
    print(f"\n==================================================")
    print(f"Translating: {os.path.basename(input_ass)}")
    print(f"Destination: {output_ass}")
    print(f"==================================================")

    with open(input_ass, 'r', encoding='utf-8', errors='replace') as f:
        raw_lines = f.readlines()

    header_lines = []
    events = []
    in_events = False

    for line in raw_lines:
        line_clean = line.rstrip('\r\n')
        if line_clean.strip() == '[Events]':
            in_events = True
            header_lines.append(line)
            continue
        if not in_events:
            # Update title in header if present
            if line_clean.startswith('Title:'):
                header_lines.append("Title: Português (Brasil) - OmniArc Localized\n")
            else:
                header_lines.append(line)
        else:
            events.append(line_clean)

    # Find dialogues to translate
    to_translate = [] # list of (idx, speaker, text)
    processed_events = []

    for i, ev in enumerate(events):
        if not ev.startswith('Dialogue:'):
            processed_events.append({'type': 'raw', 'line': ev})
            continue

        parts = ev.split(',', 9)
        if len(parts) < 10:
            processed_events.append({'type': 'raw', 'line': ev})
            continue

        style = parts[3].strip()
        speaker = parts[4].strip()
        text = parts[9]

        # Check if line should be translated
        is_translatable = False
        if dialogue_only:
            is_translatable = True
        else:
            # Translate styles like Default, Alt, Cursed, or if speaker is named
            # Exclude signs, drawings, and karaoke
            if r'\p1' not in text and not any(style.startswith(x) for x in ['OP', 'ED', 'Signs', '<<folder>>', 'f0ld3r']):
                is_translatable = True

        if is_translatable and text.strip():
            item_id = len(to_translate)
            to_translate.append((item_id, speaker, text))
            processed_events.append({
                'type': 'dialogue',
                'id': item_id,
                'prefix': ','.join(parts[:9]) + ','
            })
        else:
            processed_events.append({'type': 'raw', 'line': ev})

    print(f"Total events: {len(events)} | Translatable dialogue lines: {len(to_translate)}")

    # Chunk into groups of 45 lines
    CHUNK_SIZE = 45
    chunks = [to_translate[i:i + CHUNK_SIZE] for i in range(0, len(to_translate), CHUNK_SIZE)]
    print(f"Divided into {len(chunks)} chunks of ~{CHUNK_SIZE} lines.")

    all_translations = {}
    start_time = time.time()

    for idx, chunk in enumerate(chunks):
        t0 = time.time()
        c_trans = translate_chunk(chunk)
        all_translations.update(c_trans)
        elapsed = time.time() - t0
        print(f"  Chunk {idx+1}/{len(chunks)} ({len(chunk)} lines) done in {elapsed:.1f}s - {len(all_translations)}/{len(to_translate)} total")

    total_time = time.time() - start_time
    print(f"All lines translated in {total_time:.1f}s ({total_time/60:.2f} min). Writing output...")

    # Reconstruct ASS file
    os.makedirs(os.path.dirname(output_ass), exist_ok=True)
    with open(output_ass, 'w', encoding='utf-8') as f:
        for hl in header_lines:
            f.write(hl)
        for pe in processed_events:
            if pe['type'] == 'raw':
                f.write(pe['line'] + '\n')
            elif pe['type'] == 'dialogue':
                trans_text = all_translations.get(pe['id'], '')
                f.write(pe['prefix'] + trans_text + '\n')

    print(f"Successfully generated: {output_ass}")
    return True


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: translate_series.py <input_ass> <output_ass> [--dialogue-only]")
        sys.exit(1)

    inp = sys.argv[1]
    out = sys.argv[2]
    d_only = '--dialogue-only' in sys.argv
    translate_file(inp, out, dialogue_only=d_only)
