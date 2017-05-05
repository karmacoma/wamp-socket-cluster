'use strict';

const get = require('lodash.get');
const WAMPServer = require('./WAMPServer');
const schemas = require('./schemas');

class MasterWAMPServer extends WAMPServer {

	/**
	 * @param {SocketCluster.SocketCluster} socketCluster
	 * @param {Object} config
	 */
	constructor(socketCluster, config) {
		
		super();
		this.socketCluster = socketCluster;
		this.workerIndices = [];

		socketCluster.on('workerStart', worker => {
			this.reply(null, {
				registeredEvents: Object.keys(this.endpoints.event),
				config: config || {},
				type: schemas.MasterConfigRequestSchema.id,
				workerId: worker.id
			});

			this.workerIndices.push(worker.id);
		});

		socketCluster.on('workerMessage', (worker, request) => {
			if (schemas.isValid(request, schemas.MasterWAMPRequestSchema) || schemas.isValid(request, schemas.InterProcessRPCRequestSchema)) {
				this.processWAMPRequest(request, null);
			}
		});

		socketCluster.on('workerExit', workerInfo =>
			this.workerIndices.splice(this.workerIndices.indexOf(workerInfo.id)), 1);
	}

	/**
	 * @param {SocketCluster.Socket} socket
	 * @param {WAMPRequestSchema} request
	 * @param {*} error
	 * @param {*} data
	 */
	reply(socket, request, error, data) {
		const payload = this.createResponsePayload(request, error, data);
		return this.socketCluster.sendToWorker(request.workerId, payload);
	}

}

module.exports = MasterWAMPServer;
