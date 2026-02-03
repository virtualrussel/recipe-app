import { CloudWatchLogsClient, CreateLogStreamCommand, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { fetchAuthSession } from 'aws-amplify/auth';

const LOG_GROUP_NAME = '/aws/amplify/recipe-app/frontend';
const IS_PRODUCTION = import.meta.env.PROD;
const MAX_BUFFER_SIZE = 100;

class Logger {
  constructor() {
    this.client = null;
    this.logStreamName = null;
    this.sequenceToken = null;
    this.logBuffer = [];
    this.flushInterval = null;
    this.isInitialized = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initPromise) return this.initPromise;
    if (this.isInitialized) return Promise.resolve(true);

    if (!IS_PRODUCTION) {
      console.log('CloudWatch Logs disabled in development');
      return Promise.resolve(false);
    }

    this.initPromise = (async () => {
      try {
        const session = await fetchAuthSession();
        
        if (!session.credentials) {
          console.warn('No credentials for CloudWatch');
          return false;
        }

        this.client = new CloudWatchLogsClient({
          region: 'us-west-2',
          credentials: session.credentials
        });

        this.logStreamName = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        
        await this.createLogStream();
        this.startPeriodicFlush();
        this.isInitialized = true;
        
        console.log('CloudWatch Logs initialized');
        return true;
      } catch (error) {
        console.warn('CloudWatch init failed:', error.message);
        return false;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  cleanup() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    if (this.logBuffer.length > 0) {
      this.flush();
    }
    
    this.client = null;
    this.logStreamName = null;
    this.sequenceToken = null;
    this.logBuffer = [];
    this.isInitialized = false;
    this.initPromise = null;

    console.log('CloudWatch Logs cleaned up');
  }

  async createLogStream() {
    if (!this.client) return;

    try {
      await this.client.send(new CreateLogStreamCommand({
        logGroupName: LOG_GROUP_NAME,
        logStreamName: this.logStreamName
      }));
    } catch (error) {
      if (error.name !== 'ResourceAlreadyExistsException') {
        console.warn('Failed to create log stream:', error.message);
      }
    }
  }

  async flush() {
    if (!this.client || !this.isInitialized || this.logBuffer.length === 0) return;

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const params = {
        logGroupName: LOG_GROUP_NAME,
        logStreamName: this.logStreamName,
        logEvents: logsToSend
      };

      if (this.sequenceToken) {
        params.sequenceToken = this.sequenceToken;
      }

      const response = await this.client.send(new PutLogEventsCommand(params));
      this.sequenceToken = response.nextSequenceToken;
    } catch (error) {
      console.warn('Failed to send logs:', error.message);
      
      if (this.logBuffer.length < MAX_BUFFER_SIZE) {
        this.logBuffer = [...logsToSend, ...this.logBuffer];
      } else {
        console.warn('Buffer full, dropping', logsToSend.length, 'logs');
      }
    }
  }

  startPeriodicFlush() {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  addLog(level, message, metadata = {}) {
    if (!IS_PRODUCTION || !this.isInitialized || this.logBuffer.length >= MAX_BUFFER_SIZE) {
      return;
    }

    const logEntry = {
      timestamp: Date.now(),
      message: JSON.stringify({
        level,
        message,
        ...metadata,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      })
    };

    this.logBuffer.push(logEntry);

    if (this.logBuffer.length >= 10) {
      this.flush();
    }
  }

  debug(message, metadata) {
    console.debug(message, metadata);
  }

  info(message, metadata) {
    console.info(message, metadata);
    this.addLog('INFO', message, metadata);
  }

  warn(message, metadata) {
    console.warn(message, metadata);
    this.addLog('WARN', message, metadata);
  }

  error(message, metadata) {
    console.error(message, metadata);
    this.addLog('ERROR', message, metadata);
  }

  userAction(action, metadata = {}) {
    this.info(`User action: ${action}`, { event: 'USER_ACTION', action, ...metadata });
  }

  performance(operation, duration, metadata = {}) {
    this.info(`Performance: ${operation}`, { 
      event: 'PERFORMANCE', 
      operation, 
      duration, 
      ...metadata 
    });
  }
}

const logger = new Logger();
export default logger;
