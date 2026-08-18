from pathlib import Path

p = Path("/usr/src/stoat/Revolt.toml")
text = p.read_text(encoding="utf-8")
for section in ("[features.limits.new_user]", "[features.limits.default]"):
    rest = text.split(section, 1)[-1].split("[", 1)[0]
    if "voice_quality" not in rest:
        text = text.replace(
            section,
            section + "\nvoice_quality = 48000\nvideo = true",
            1,
        )
p.write_text(text, encoding="utf-8")
print("revolt patched")
