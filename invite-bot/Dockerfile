FROM python:3.12-alpine
WORKDIR /app
COPY invite-bot/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY invite-bot/ /app/
USER nobody
CMD ["python", "/app/bot.py"]
