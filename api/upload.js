module.exports = async function (context, req) {
  context.log('Function called successfully');
  
  context.res = {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      message: "Function is working!"
    }
  };
};
