FROM python:3.12-alpine
WORKDIR /app
COPY invite/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY invite/invite.py /app/invite.py
USER nobody
CMD ["python", "/app/invite.py"]
