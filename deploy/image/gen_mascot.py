# -*- coding: utf-8 -*-
"""Generates the «variant B» loading mascot (torob's radish turned into a little walking figure
rolling the radish forward) with OpenAI's image API, using daii's own OpenAI key
(side-task convention: app inference stays on BoxAPI, side assets use OpenAI directly).

    python -I deploy/image/gen_mascot.py
"""
import base64
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # torobche-dev/
ENV_PATH = os.path.join(os.path.dirname(ROOT), ".env")  # agentic-hackathon/.env (sibling folder, shared hackathon key)
OUT_PATH = os.path.join(ROOT, "frontend", "public", "img", "mascot-loading.png")

PROMPT = (
    "Flat vector app mascot icon, transparent background, for a mobile shopping app's loading screen. "
    "A small, friendly humanoid character whose head and body are shaped like a red radish (torob's own "
    "radish-root logo shape, bright red #e91e33 top fading to dark red #bf0f22, with two small green leaf "
    "shapes #6fbc23 and #519a23 sprouting from the top like hair), with simple round white-gloved cartoon "
    "hands and short red stub legs mid-stride (walking pose, one leg forward), one arm reaching down and "
    "slightly behind to push/roll a smaller plain red radish like a ball along the ground. Clean minimal "
    "flat shapes, soft rounded outlines, no gradients besides the ones described, no text, no shadow floor, "
    "centered, cheerful tech-startup mascot style, high quality, crisp vector edges."
)


def _load_key():
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    if os.path.isfile(ENV_PATH):
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("OPENAI_API_KEY="):
                    return line.split("=", 1)[1].strip()
    sys.exit("OPENAI_API_KEY پیدا نشد (نه در env نه در " + ENV_PATH + ")")


def main():
    from openai import OpenAI

    client = OpenAI(api_key=_load_key())
    print("در حال ساختِ تصویرِ آدمکِ ترب با gpt-image-1 ...")
    r = client.images.generate(
        model="gpt-image-1",
        prompt=PROMPT,
        size="1024x1024",
        quality="medium",
        background="transparent",
        n=1,
    )
    b64 = r.data[0].b64_json
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "wb") as f:
        f.write(base64.b64decode(b64))
    print("ذخیره شد:", OUT_PATH)


if __name__ == "__main__":
    main()
