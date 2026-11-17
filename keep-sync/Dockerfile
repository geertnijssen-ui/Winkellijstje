FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY keep_sync.py .
ENV STATE_FILE=/data/keep_state.json
VOLUME /data
CMD ["python", "keep_sync.py", "--loop"]
