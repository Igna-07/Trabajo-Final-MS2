FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY database /app/database
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN useradd --create-home stock
USER stock
EXPOSE 3000
CMD ["sh", "-c", "python -m app.setup && uvicorn app.main:app --host 0.0.0.0 --port 3000"]
