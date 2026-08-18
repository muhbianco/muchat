FROM python:3.12-alpine
WORKDIR /app
COPY sso/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY sso/sso.py /app/sso.py
USER nobody
CMD ["python", "/app/sso.py"]
