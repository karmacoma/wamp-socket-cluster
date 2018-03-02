const get = require('./utils').get;
const schemas = require('./schemas');

class WAMPClient {
	/**
	 * @returns {number}
	 */
	static get MAX_CALLS_ALLOWED() {
		return 100;
	}

	/**
	 * @returns {number}
	 */
	static get MAX_GENERATE_ATTEMPTS() {
		return 10e3;
	}

	/**
	 * @param {Object} procedureCalls
	 * @returns {*}
	 */
	static generateSignature(procedureCalls) {
		const generateNonce = () => Math.ceil(Math.random() * 10e3);
		let generateAttempts = 0;
		while (generateAttempts < WAMPClient.MAX_GENERATE_ATTEMPTS) {
			const signatureCandidate = `${(new Date()).getTime()}_${generateNonce()}`;
			if (!procedureCalls[signatureCandidate]) {
				return signatureCandidate;
			}
			generateAttempts += 1;
		}
		return null;
	}

	/**
	 * @param {number} requestsTimeoutMs - time [ms] to wait for RPC responses sent to WAMPServer
	 */
	constructor(requestsTimeoutMs = 10e3) {
		this.callsResolvers = {};
		this.requestsTimeoutMs = requestsTimeoutMs;
	}

	/**
	 * @param {Object} socket - SocketCluster.Socket
	 * @returns {Object} wampSocket
	 */
	upgradeToWAMP(socket) {
		if (socket.call && socket.listeners('rpc-response').length) {
			return socket;
		}
		const wampSocket = socket;
		wampSocket.on('rpc-response', (result) => {
			if (schemas.isValid(result, schemas.RPCResponseSchema)) {
				const resolvers = get(this.callsResolvers, `${result.procedure}.${result.signature}`);
				if (resolvers) {
					if (result.success) {
						resolvers.success(result.data);
					} else {
						resolvers.fail(result.error);
					}
					clearTimeout(resolvers.requestTimeout);
					delete this.callsResolvers[result.procedure][result.signature];
				} else {
					throw new Error(`Unable to find resolving function for procedure ${result.procedure} with signature ${result.signature}`);
				}
			}
		});

		/**
		 * Call procedure registered in WAMPServer
		 * @param {string} procedure
		 * @param {*} data
		 * @returns {Promise}
		 */
		wampSocket.call = (procedure, data) => new Promise((success, fail) => {
			if (!this.callsResolvers[procedure]) {
				this.callsResolvers[procedure] = {};
			}
			if (Object.keys(this.callsResolvers[procedure]).length >= WAMPClient.MAX_CALLS_ALLOWED) {
				return fail(`No more than ${WAMPClient.MAX_CALLS_ALLOWED} calls allowed`);
			}
			const signature = WAMPClient.generateSignature(this.callsResolvers[procedure]);
			if (!signature) {
				return fail(`Failed to generate proper signature ${WAMPClient.MAX_GENERATE_ATTEMPTS} times`);
			}
			const requestTimeout = setTimeout(() => {
				delete this.callsResolvers[procedure][signature];
				fail('RPC response timeout exceeded');
			}, this.requestsTimeoutMs);

			this.callsResolvers[procedure][signature] = { success, fail, requestTimeout };

			return socket.emit('rpc-request', {
				data,
				procedure,
				signature,
				type: schemas.RPCRequestSchema.id,
			});
		});
		return wampSocket;
	}
}

module.exports = WAMPClient;
