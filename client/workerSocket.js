// workerSocket.js
// for use with KinectJS

var _WS,
	_message = function( e ) {
		postMessage( e.data );
	};

onmessage = function( e ) {
	//e.data = { addr : 'ws://' + addr + '/__depth', socket : ChromeOrMoz }
	var data = e.data;
	
	if( !_WS )
	{
		var addr = data.addr,
			socket_type = data.socket;
		
		socket_type === "firefox"
		? _WS = new MozWebSocket( addr )	//firefox doesnot currently allow webSockets in webWorkers
		: _WS = new WebSocket( addr );
		
		_WS.onmessage = _message;
		_WS.onopen = function() {
			postMessage('OPEN');
		}
		
		data = addr = socket_type = null;
		return false;
	}
	else
	{
		_WS.send( data );
		if( data == 'KILL' )
		{
			_WS.close();	//closing the websocket
			_WS = null;
			close();		//closing self
		}
	}
};